# Fix: cd-roll-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts and positions only; timing A/Bs deferred, user 2026-10-02)
**Stage:** F (build card closed); D fast path proposed to the lead ("countdown rAF callbacks → 0 by code"), V = the
user's blind swipe test (ticket below)
**Device class / gate:** render-bound / main-thread script removal; gate = counts (no timing now) + the user's swipe test
**Driver(s) behind the claims:** Chrome CDP traces at y 0 (headless, 60 Hz; headed for 120 Hz), WebKit iOS Simulator
Timeline counts. No phone runs.
**Prediction:** counts only (below); no `fixes/PREDICTIONS.md` row while timing is deferred
**Topic:** `research/gpu-props/README.md` G4 (user decision T-030 #10, "do cd-roll-ca as highest priority as well")
**Stacked on:** `fix-cd-strip` (arm b) on `st6-rb2`: base `_app/immutable/nodes/2.DyWL8TcE.js` sha256 `358cd8ae16b9…`
(header of `patch.diff`); rebuild with `node tools/fix.mjs apply cd-strip --on st6-rb2 --reset` then
`node tools/fix.mjs apply cd-roll-ca --on cd-strip`. The cd-strip patch is not committed here (its owner's deliverable).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: new helpers after `__cdStripY` (`__crPath`, `__crAt`,
`__crClock`, a module-level `visibilitychange` listener), and in `$E` (the digit) the spring effect and the strip
snippet. Built overlay sha256 `9ac52b08bc32…`.

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
- **Hidden tab.** A module-level `visibilitychange` listener records when the page was hidden; while no frames run,
  the "current value" is the path at the hide time (what the original's frozen rAF shows).
- **Off-screen.** Unchanged gate from countdown-idle-raf: when the clock is off-screen or inactive the digit snaps
  (`__crStop()` cancels any running roll first).
- **Hero only.** The panel clock (`.countdown.inverse`) keeps the original rAF spring. Its strips are painted
  unlayered (st6-rb2 `cdwc`), and a running compositor animation would layer them: other glyph rasterisation
  (fix-cd-strip: 67 of 169 panel shots differ for layered strips) and whole-strip repaints while the morph scales the
  panel (Simulator). The panel is active only at the morph, never at the top of the page.
- **Fallback.** No strip yet, no `Element.animate`, or a path that does not end in [0, 9]: the original rAF spring.

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

Roll composited in Chrome: OBSERVED (no added main frames during rolls; the trace's `Animation` events carry no
`compositeFailed` for the strip animations), in our setup.

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
| headless 60 Hz, 40 s, 16 jumps (`probe-build-h60b.json`) | 2405 | 0.133 / 0.015 px | 0.145 / 0.021 px | 0.007 px | 0.61 / 0.026 px |
| headless 60 Hz, 20 s, 8 jumps, hero-only build (`probe-build-h60c.json`) | 1203 | 0.026 / 0.016 px | 0.131 / 0.019 px | 0.014 px | 0.22 / 0.05 px (forced) |
| before the first-frame fix (`probe-build-h60.json`) | 2403 | 0.45 / 0.019 px | 4.51 / 0.056 px | 0.098 px | 0.61 / 0.027 px |
| headed, display 120 Hz, 30 s, 12 jumps (`probe-build-headed.json`) | 3603 | 27.7 / 2.5 px | 26.7 / 4.1 px | 0.28 px | n/a |

- The model is validated on the base page: the offline chain reproduces the original's own per-frame values within
  0.0005 px (60 Hz, 11 rolls) and 0.0008 px (120 Hz, 16 rolls) (`probe-base-h60.json`, `probe-base-headed.json`).
- At 60 Hz the build is within 0.15 px of the original at every frame, while the original itself moves by up to
  0.61 px with 0.1 ms of frame-stamp jitter: inside its own frame-to-frame variation.
- At 120 Hz the build still shows the 60 Hz path; the original at 120 Hz differs from its own 60 Hz path by up to
  3.3 px (one step) and 29.5 px (0→9, offline model), and the build vs the original at 120 Hz measured 27.7 px max,
  p95 2.5 px. This is the known, user-accepted difference (T-030). iPhone Safari runs page rendering at 60 Hz
  (CLAUDE.md, CONFIRMED pref), so the phone shows the 60 Hz path.
- UNRESOLVED: WebKit samples a Core Animation animation at the display's presentation time, the original's value
  comes from the rAF stamp; that could add a constant lead of up to one frame on the phone. Decisive check: a phone
  frame capture of a roll (not run: no phone use in this task).

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
6 lead: to sign
```

```
BUILD cd-roll-ca-1 on cd-strip(b) on st6-rb2 · overlay fixes/cd-roll-ca/overlay
served hashes: nodes/2.DyWL8TcE.js 9ac52b08bc32… (x-mirror-source: overlay, logged by roll-probe), CSS = cd-strip's
parity: hero roll within 0.15 px of the original's 60 Hz frames (table above); panel unchanged (original spring)
a11y diff: n/a (aria-hidden digits; aria-label unchanged)
mechanism delta: countdown rAF 108 → 4 / 4 s; main frames during rolls = outside rolls
idle triple: y 0 above; mid-page: clock off-screen → snap, unchanged from st6-rb2; at the pin: panel = original
memory/layers: one transform animation layer per rolling hero digit while it rolls (Chrome promotes during the
animation; hero faces were layered already in st6-rb2)
debug hooks: none
```

**Scenarios not run:** phone (any driver), real tab hide/show (only the synthetic `visibilitychange`), reduced
motion (unchanged code path: snap), panel at the morph (unchanged code path: original spring).

## Risks, conflicts, follow-ups

- Not frame-identical at 120 Hz (see above); the user judges in a blind swipe test (ticket sent to the lead).
- Couples to fix-cd-strip's `__cdStripY` and strip markup: a change there needs a re-apply here.
- The one-shot rAF per roll is a main-thread callback (cheap, no style write); WebKit "0 countdown rAF at rest"
  holds, "at roll start" it is 1.
- Tools: `roll-probe.mjs`, `comp-check.mjs`, `sim-counts.mjs` are topic-local probes in this folder (not in
  `tools/`); no measurement code was changed.
