# Fix: cd-roll-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts and positions only; timing A/Bs deferred, user 2026-10-02); review round 1 answered
(B1 fixed in code, B2/B3 in text); round 2 PASS with three nits, answered (audit of the first hide analysis,
forced-roll parity, served hashes); WebKit hidden-page check run in the Simulator found a difference from Chrome on
return from an app switch; round 3 build `2af461dc…` fixes it (lead's order: a roll's "ran a frame" flag and a hide
watch); Chrome hide check, one 60 Hz probe and the Simulator check re-run on it; review round 3 (hide code only): PASS with nits, nits applied.
To rebuild on cd-strip's landed patch.
**Stage:** F (build card); D signed by the lead, fast path, 2026-10-03 01:35Z; V = the user's blind watched comparison
(no touch; ticket rev 2 held by the lead)
**Device class / gate:** render-bound / main-thread script removal; gate = counts (no timing now) + the user's watched
blind comparison
**Driver(s) behind the claims:** Chrome CDP traces at y 0 (headless, 60 Hz; headed for 120 Hz), WebKit iOS Simulator
Timeline counts and a hidden-page check (app switch). No phone runs.
**Prediction:** counts only (below); no `fixes/PREDICTIONS.md` row while timing is deferred
**Topic:** `research/gpu-props/README.md` G4 (user decision T-030 #10, "do cd-roll-ca as highest priority as well")
**Stacked on:** `fix-cd-strip` (arm b) on `st6-rb2`: base `_app/immutable/nodes/2.DyWL8TcE.js` sha256 `358cd8ae16b9…`
(header of `patch.diff`); rebuild with `node tools/fix.mjs apply cd-strip --on st6-rb2 --reset` then
`node tools/fix.mjs apply cd-roll-ca --on cd-strip`. The cd-strip patch is not committed here (its owner's deliverable).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: new helpers after `__cdStripY` (`__crPath`, `__crAt`,
`__crClock`, `__crWatch`, a module-level `visibilitychange` listener), and in `$E` (the digit) the spring effect and the strip
snippet. Built overlay sha256 `2af461dc50ad…` (round 3; round 2 `673b110d118c…`, round 1 `9ac52b08bc32…`). Served
from the immutable snapshot copies `out/cd-roll-ca/snap/{C,V,V3}` (V = round 2, V3 = round 3) (hashes in `HASHES.txt`, one-command server `out/cd-roll-ca/serve-snap.sh`).

## Why it lags

Each countdown digit is a Svelte component (`$E`) whose effect runs a rAF spring (`GE`: semi-implicit Euler, 16 ms
substeps, stiffness 280, damping 18, mass 0.3) for ~0.45-0.57 s after every target change, writing the strip's
`translateY` every frame. The 1 Hz tick therefore costs ~30 rAF callbacks plus a style recalc per frame for half of
every second, forever, in the hero clock (and in the panel clock when it is active). Measured at y 0 (4 s windows):
Chrome 108 countdown rAF callbacks, WebKit Simulator 105-108 (`out/cd-roll-ca/comp-check-base-p2.json`,
`out/cd-roll-ca/sim-counts-*.json`).

## What changed

At each target change the hero digit computes the path the original would show at 60 Hz and plays it as ONE Web
Animation on the strip (`strip.animate(keyframes, { duration, easing: 'linear', fill: 'backwards' })`,
`startTime` = the change time). No per-frame script; the base inline transform is set to the target at once, so the
animation needs no forwards fill.

- **The path (`__crPath`).** The original's displayed value at time x after a change, on a 60 Hz display whose frame
  lands exactly at x, is `GE(x mod T)` followed by whole 60 Hz frames (T = 16.667 ms). That function is exact at every
  60 Hz frame of any phase and continuous; on [kT, kT+16] it is a quadratic in the phase, so it is sampled from 33
  phase lanes (0-16 ms, 0.5 ms apart) with as many points per segment as keep linear interpolation within 5e-4 cell,
  plus a point at every whole frame. 144 keyframes for a one-step roll, 343 for 0→9; durations 433-567 ms. All
  values stay in [0, 9], so the strip mapping (`__cdStripY`) needs no wrap handling (the 9→0 wrap is a path from 9
  down to 0, exactly as the original's spring goes). The brief's 240 Hz uniform grid was 0.23 px (one step) / 2.07 px
  (0→9) off; this grid is ≤ 0.019 px (offline check against the original's chain, all 100 from/to pairs).
- **Mid-roll change.** The new roll starts from the running path's value at the current animation clock
  (`__crAt` at `document.timeline.currentTime`, the frame the original last showed), velocity 0, like the original.
- **First frame.** When the change lands after a frame began but before its rAF callbacks, the original's first
  callback steps nothing (`GE(o − n)` with o < n) and restarts its clock at that frame's stamp. One rAF per roll
  (never per frame) moves the animation's `startTime` to that stamp. Without it, random-phase changes were off by up
  to 4.5 px in the first frames.
- **Hidden tab.** A module-level `visibilitychange` listener records when the page was hidden
  (`document.timeline.currentTime` at the hide, else `performance.now()`); while no frames run, the "current value"
  is the path at that time (what the original's frozen rAF shows). Round 3: a roll none of whose frames has run yet
  (its start-frame rAF sets `ran`) is held at its start, hidden or not, since the original's spring only moves in a
  frame; and one pending callback (`__crWatch`, re-armed on every visibilitychange, its id kept so hides never stack)
  ends the hold at the first frame after a hide: a frame that runs while still hidden (WebKit runs one before the
  visible event, OBSERVED, Simulator) becomes the new held time and the watch goes on, the first visible frame ends
  the hold. The start-frame rAF of a roll is cancelled by
  `__crStop` (review round 1, B1): cD's 1 s interval keeps ticking in a hidden tab, and without the cancel every hidden
  tick left one more pending callback holding its path and Animation (the original keeps at most one per digit).
- **Off-screen.** Unchanged gate from countdown-idle-raf: when the clock is off-screen or inactive the digit snaps
  (`__crStop()` cancels any running roll first).
- **Hero only.** The panel clock (`.countdown.inverse`) keeps the original rAF spring. Its strips are painted
  unlayered (st6-rb2 `cdwc`), and a running compositor animation would layer them: other glyph rasterisation
  (fix-cd-strip: 67 of 169 panel shots differ for layered strips) and whole-strip repaints while the morph scales the
  panel (Simulator). The panel is active only at the morph, never at the top of the page.
- **Fallback.** No strip yet, no `Element.animate`, or a path that does not end in [0, 9]: the original rAF spring.
- **Edge cases (by reading the code, not probed).** A digit removed mid-roll (`$E` unmounts): its Animation goes with
  the detached strip; the one pending start-frame callback fires once and only touches that roll's own object. A new
  cell height after a roll finished: `__crPlay` re-creates the finished roll's animation at its old `startTime`, so
  it is already finished and shows the inline target (one throwaway animation per resize, no visible change).
- **Script cost per tick.** Building the path is the only new per-tick script: `__crPath` median 0.040 ms, p95
  0.073 ms per call (0.035 ms for a one-step roll), offline in Node 24 on this Mac under load (OBSERVED, a CPU
  micro-benchmark, not a page timing; scratch `pathcost.mjs`, all 90 from/to pairs × 20).

What is visually identical and what is not: the roll follows the original's 60 Hz path (numbers below). On a
120 Hz display the original takes another path (it is frame-rate dependent); the build keeps the 60 Hz one.

## Why that is faster

The per-frame rAF callback and the per-frame inline style write disappear; the compositor runs the transform. Main
thread per roll: one style recalc at the change and one rAF callback (the start fix); in Chrome the roll adds no
main frames while it runs (table below).

## Before / after (counts, no timing)

Chrome 154, headless, 430x932 DPR 3 mobile, y 0, 4 s, every other animation frozen (`comp-check.mjs --pause-others 2`:
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

## Position identity (the user's rule: within the original's own frame-to-frame variation)

`roll-probe.mjs` records in Chrome, per rAF, the translateY Chrome computes for every strip (for a Web Animation this
is its value at the frame time, which the compositor samples too), and every roll's Animation; offline it runs the
ORIGINAL's spring (literal copy of `GE`) over the very same frame stamps, from the same change time and start value,
and reports |B − A| per frame in px (cell 36 px). Forced changes: `Date.now` jumps by random seconds at random times
plus a synthetic `visibilitychange`, so the countdown ticks at a random phase, often mid-roll, multi-digit.

| run | frames | B vs A: normal ticks max / p95 | forced (random phase) max / p95 | start value diff max | original's own stamp jitter (A on real stamps vs ideal 60 Hz) max / p95 |
|---|---|---|---|---|---|
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
BUILD cd-roll-ca-3 (round 3; round 2 cd-roll-ca-2 673b110d…, round 1 cd-roll-ca-1 9ac52b08…) on cd-strip(b) on st6-rb2 · overlay fixes/cd-roll-ca/overlay
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
- cd-strip will probably land with one compositing layer per cell (`.cell{will-change:transform}`, only cells near
  the clip backed; JS and `__cdStripY` unchanged, fix-cd-strip and the lead, 2026-10-03). Risk for this fix: the
  strip moves by a Core Animation animation, so a cell entering the clip mid-roll could show blank or late. Rebuild
  checks (on cd-strip's landed patch, before review sign-off): Simulator frozen frames at 10/30/50/70/90 % of a roll,
  incl. a 9→0 wrap and a multi-digit carry (no blank or partial cell vs C); Timeline Paint records per roll, V vs C;
  plus the Chrome hide-check, sim-hide (3 cycles per arm) and an h60 probe again.
- `__crWatch` re-arms on every frame that runs while `document.hidden` is true. An engine that kept running frames for
  a hidden page would turn it into a per-frame rAF for as long as the page stays hidden (cheap, nothing drawn). Neither
  engine did here: Chrome ran 0 frames while hidden, WebKit (Simulator) 1 frame just before the visible event
  (OBSERVED, review round 3 nit 1).
- Hidden page on WebKit: the residual above (≤ ~1.4 px here, bounded by the 0.3-0.5 s between WebKit's last frame and
  its hidden event) stays; the real phone's event order is UNRESOLVED (not checked on the device).
- The one-shot rAF per roll is a main-thread callback (cheap, no style write); WebKit "0 countdown rAF at rest"
  holds, "at roll start" it is 1.
- Tools: `roll-probe.mjs`, `comp-check.mjs`, `sim-counts.mjs`, `hide-check.mjs` are topic-local probes in this folder (not in
  `tools/`); no measurement code was changed.
