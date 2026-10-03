# Fix: cd-roll-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** round 4, "cells-only" on fix-cd-strip's strip-rw (lead, 2026-10-03 04:4xZ and 05:1xZ). Dev-base checks
on strip-rw JS `5e37af69…` + CSS `9b2f89ea…` (C5/V6); counted session A on cd-strip's review-round-2 base (CSS
`40078cb2…`, C6/V7); the rest of the counted set waits for cd-strip's PR-008 rev 2 (its base may change again).
Rounds 1-3 (one animation per strip, on st6-rb2) passed review (round 3 PASS, `2af461dc…`); their sections are kept
below as history, labelled.
**Stage:** F (build card); D signed by the lead, fast path, 2026-10-03 01:35Z; V = the user's blind watched comparison
(no touch; ticket rev 2 held by the lead)
**Device class / gate:** render-bound / main-thread script removal; gate = counts (no timing now) + the user's watched
blind comparison
**Driver(s) behind the claims:** Chrome CDP traces at y 0 (headless, 60 Hz; headed for 120 Hz), WebKit iOS Simulator
Timeline counts, frozen and running screenshots, layer census, and a hidden-page check (app switch). No phone runs.
**Prediction:** counts only (below); no `fixes/PREDICTIONS.md` row while timing is deferred
**Topic:** `research/gpu-props/README.md` G4 (user decision T-030 #10, "do cd-roll-ca as highest priority as well")
**Stacked on:** `fix-cd-strip` strip-rw (its patch on st6-rb2): base `_app/immutable/nodes/2.DyWL8TcE.js` sha256
`5e37af69bcc4…`, CSS `40078cb2d9cf…` (cd-strip `patch.diff` `1f3c26a16563…`; the dev build had CSS `9b2f89ea58bd…`,
patch `48bc7adf7f03…`, same JS); rebuild with
`node tools/fix.mjs apply cd-strip --on st6-rb2 --reset` then `node tools/fix.mjs apply cd-roll-ca --on cd-strip`.
The cd-strip patch is not committed here (its owner's deliverable).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only (the CSS is cd-strip's, unchanged): new helpers after
`__cdStripM` (`__crPath`, `__crAt`, `__crClock`, `__crWatch`, `__crCells`, a module-level `visibilitychange`
listener), and in `$E` (the digit) the spring effect, `__crTops`/`__crStop`/`__crPlay`, and in the strip snippet `g`
only the replay effect, `__crEl = w` and cd-strip's cell-top effect routed through `__crTops`. Built overlay sha256
`73dff152e454…` (V6 = V7). Served from immutable snapshot copies `out/cd-roll-ca/snap/{C6,V7}` (hashes in
`HASHES.txt`; earlier C, V, V3, C4, V4, V5, C5, V6), one-command server `out/cd-roll-ca/serve-snap.sh`.

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

**The strip (cd-strip strip-rw, not changed here).** `strip > span.cdwrap > 11 cells` (0-9 and a second 0 for the
9→0 wrap). At rest: cell k at `top: k*c`, the uncomposited wrapper at `top: -M*c` with `M = __cdStripM(v)` = the
whole cell nearest v, and the strip layer at `translateY(__cdStripY(v,c) + M*c)` (0 at an integer v). Each cell is its
own layer (CSS); only cells near the clip are backed. c is the spacer's integer `offsetHeight`.

**The roll (cells-only).** Layout can't move inside a compositor animation, so the roll moves cells, never the strip:
- `__crCells(K)`: the cells within 1.5 cells of any point of the path (its whole range included). Cells farther away
  keep their rest top and stay at least 1.5 cells outside the clip throughout.
- At the start (`__crPlay`), each moved cell k gets `top: M*c` with M = `__cdStripM(target)`: with cd-strip's wrapper
  at `-M*c` that is 0 from the strip layer, so the cell's own transform is its whole offset,
  `translateY(k*c + __cdStripY(n,c))` = `(k − n)*c` along the path n. Only the offset that cell shows, never two large
  offsets that cancel in the layer tree (the reason cd-strip moved to the wrapper). The strip layer stays at 0 (the
  target is the integer the inline transform already shows), and a cell's last keyframe is its rest place.
- The wrapper is cd-strip's: the roll never writes it (its effect sets `-M*c` from the target when the target
  changes, in the same effect flush as the roll's start, before the next frame). `top M*c` plus the wrapper's `-M*c` cancel in layout exactly, since c
  and M are integers.
- At the end (the first animation's `onfinish` → `__crStop`), the animations are cancelled and the moved cells go
  back to `top k*c` in the same task (no frame in between). `__crTops` writes only the tops that change.
- `fill: both`: a frame before `startTime` shows the start, the end holds the rest place until the finish handler.

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

PENDING (counted set on cd-strip's final hash): the same run on C = strip-rw, so V6's Layout/Paint compare with its
own base (C4 is strip-rb; V6's +18 Paint vs V5 is not attributed yet: the strip-rw wrapper, the top writes, or
noise). The roll's top writes add one layout at the start and one at the end of each roll (6 rolls here).

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

## WebKit frames, layers and Timeline (round 4, Simulator; OBSERVED, Simulator, in our setup)

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
  mid-roll at fade50) cancels in this V-vs-C comparison; PENDING: the counted set reports it per arm.
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

PENDING (rest of the counted set, after cd-strip's rev 2 is decided): carry, two, step at fade50 and a hero pass,
with A/A; sim-counts frozen, 2 reps; sim-hide C/V 3 cycles; Paint records per roll; Chrome comp-check C/V, h60,
hide-check, fix.mjs check.

## Position identity (the user's rule: within the original's own frame-to-frame variation)

`roll-probe.mjs` records in Chrome, per rAF, the translateY Chrome computes for every strip (for a Web Animation this
is its value at the frame time, which the compositor samples too), and every roll's Animation; offline it runs the
ORIGINAL's spring (literal copy of `GE`) over the very same frame stamps, from the same change time and start value,
and reports |B − A| per frame in px (cell 36 px). Forced changes: `Date.now` jumps by random seconds at random times
plus a synthetic `visibilitychange`, so the countdown ticks at a random phase, often mid-roll, multi-digit.

| run | frames | B vs A: normal ticks max / p95 | forced (random phase) max / p95 | start value diff max | original's own stamp jitter (A on real stamps vs ideal 60 Hz) max / p95 |
|---|---|---|---|---|---|
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
BUILD cd-roll-ca-4 (round 4, cells-only) on cd-strip strip-rw (DEV build JS 5e37af69bcc4…, CSS 9b2f89ea58bd…) · overlay fixes/cd-roll-ca/overlay
served hashes: nodes/2.DyWL8TcE.js 73dff152e454… (V6), CSS 9b2f89ea58bd… = cd-strip's; snapshot copies out/cd-roll-ca/snap/{C5,V6}
checks (dev base): Chrome comp-check V6 (rAF 8 / 6 s, 40 animations), roll-probe h60 V6 + base fit C5 (0 px), hide-check
V6 (0 errors, 0 px start, 0.008 px first frame), fix.mjs check --on cd-strip mobile: morph both, 0 errors, 0 4xx,
1558 elements both, pixel diff top 0.19 / middle 0 / bottom 0 %; Simulator simpx debug runs 1-2 (wrap at fade50:
rects ≤ 0.0151 px, 0 unmatched, layers equal, reason animation, no added recalc running)
PENDING on cd-strip's final hash: counted simpx set + A/A, sim-counts, sim-hide C/V 3 cycles, Chrome comp-check C/V,
h60, hide-check, fix.mjs check
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

## Risks, conflicts, follow-ups

- Not frame-identical at 120 Hz, at 80 Hz, or after a late first frame (see above); the user judges in a blind
  watched comparison at rest (no touch), ticket held by the lead (rev 2).
- Couples to fix-cd-strip's `__cdStripY` and strip markup: a change there needs a re-apply here. fix-cd-strip is
  looking for a pixel-identical WebKit layout (lead, 2026-10-03 ~02:00Z), possibly a new cell pitch or offset.
  `__crPath` works in digit values and maps to px only through `__cdStripY(v, c)` with the measured cell `c`, so a
  new pitch or offset inside `__cdStripY` carries over; a different mapping (non-linear, or not via `__cdStripY`)
  or other strip markup needs this patch re-applied, the snapshot V rebuilt and the probes re-run.
- cd-strip lands with one compositing layer per cell and the uncomposited wrapper (strip-rw). The roll moves cells,
  not the strip, so a cell entering the clip mid-roll could show blank or late (F-142): not seen on the dev build in
  the Simulator (0 unmatched cells in all paused and running shots of a wrap; layers and backing unchanged mid-roll).
  The counted set re-checks it on the final hash.
- Couples to cd-strip's `__cdStripM`, the wrapper's `-M*c` and the cell-top effect (routed through `__crTops`): a change
  to the strip's geometry there needs this patch re-applied and the probes re-run.
- `__crWatch` re-arms on every frame that runs while `document.hidden` is true. An engine that kept running frames for
  a hidden page would turn it into a per-frame rAF for as long as the page stays hidden (cheap, nothing drawn). Neither
  engine did here: Chrome ran 0 frames while hidden, WebKit (Simulator) 1 frame just before the visible event
  (OBSERVED, review round 3 nit 1).
- Hidden page on WebKit: the residual above (≤ ~1.4 px here, bounded by the 0.3-0.5 s between WebKit's last frame and
  its hidden event) stays; the real phone's event order is UNRESOLVED (not checked on the device).
- The one-shot rAF per roll is a main-thread callback (cheap, no style write); WebKit "0 countdown rAF at rest"
  holds, "at roll start" it is 1.
- Tools: `roll-probe.mjs`, `comp-check.mjs`, `sim-counts.mjs`, `hide-check.mjs`, `sim-hide.mjs`, `simpx.mjs` and
  `strip-read.mjs` (strip geometry for strip-rb and strip-rw) are topic-local probes in this folder (not in `tools/`);
  no measurement code was changed.
