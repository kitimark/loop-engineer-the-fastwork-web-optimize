# Fix: cd-strip

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (built, pixel identity shown, WebKit counts on the Simulator; no timing run yet: timing A/Bs are
deferred, user 2026-10-02)
**Stage:** F (build card below). D card sent to the lead for signing: LOCATED (see the card)
**Device class / gate:** render-bound / phone-only (WebKit paint and layer work; Chrome 6x can't stand in for it)
**Driver(s) behind the claims:** Simulator Timeline + LayerTree (counts only), Chrome frozen-frame pixel harness
**Prediction:** none yet (written before the first timed or phone run)
**Topic:** G2 in `research/gpu-props/README.md` (F1 in its ranking; user T-030, highest priority). Base: **st6-rb2**
(`--on st6-rb2`). Replaces countdown-faces part (a) (the 3 slots); countdown-faces part (b), the hidden gate, stays
orthogonal (lead decision; de-countdown agrees).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (`$E`'s face snippet `g`, template `__cdStripT` and offset
function `__cdStripY` next to `ZE`; st6-rb2 overlay lines ~4021-4080), `/_app/immutable/assets/2.gBuqKVzi.css`
(`.strip`/`.cell` rules after `.face.svelte-1quva9c`; arm b: the cdwc rule retargeted to `.strip`).

## Why it lags

- Each countdown digit (`$E`) renders 10 `.face` spans (`0`-`9`), each its own layer (`will-change: transform`,
  CSS `.face.svelte-1quva9c`), placed at `KE(face, v)·c` px. st6-rb2 (countdown-idle-raf) clamps the faces to ±1
  cell. A face that rolls out of the digit's clip leaves the cell and comes back later. In WebKit a composited layer
  outside its clip loses its backing store and repaints when it re-enters (F-142, CONFIRMED by source in
  `research/gpu-props/README.md` §G2). Hero clock: 80 face layers, 54 of them backed at the top.
- Panel clock (the morph panel, nav): st6-rb2's cdwc rule makes the panel faces unlayered (`will-change: auto`), so
  every spring frame of a roll repaints the digit area inside the panel layer. The morph pin holds 91 of st6-rb2's
  long finger frames (C-026, `research/gpu-props/README.md` §0).
- Code: st6-rb2 overlay JS `$E` 4027-4084 (now ~4036-4090), `KE` 4008, `GE` 3993-4007 (spring, unchanged). Panel
  call `cD(…, { inverse: !0, active })` ~13532.

## What changed

One static strip per digit replaces the 10 faces (`patch.diff`, +42 −22 on st6-rb2):

- `span.strip` (absolute, inset 0, `will-change: transform`) with 11 `span.cell`s `0 1 … 9 0`. Each cell is a face's
  box (absolute, `height: 100%`, glyph centred by the same flex rules), placed at `top: k·c px`. `c` is the spacer's
  integer `offsetHeight`, the same value the original multiplies `KE` by.
- One transform per digit: `translateY(__cdStripY(v, c) px)` with `__cdStripY = (v, c) => -(((v % 10) + 10) % 10) * c`.
  Cell k then lands at `(k − n)·c`. For the two cells inside the digit this is exactly `KE(k, v)·c`, the original
  face's offset. The 11th cell carries the 9 → 0 wrap and the spring's overshoot. The text never changes, and the
  strip always overlaps its clip, so its layer is never detached.
- The spring (`GE`), its rAF loop, st6-rb2's pause/snap while hidden and the `animate`/`active` props are untouched.
  The value → offset mapping lives in one function (`__cdStripY`) and one template effect, so fix-cd-roll-ca can
  drive the strip from outside.
- Panel arms. **(b), the default:** cdwc's rule retargeted to the strip
  (`.start-selling-morph-panel .waitlist-closing-countdown .strip.svelte-1quva9c { will-change: auto; }`), so panel
  strips stay unlayered, as the faces are on st6-rb2. **(a), rejected:** `fixes/cd-strip--a/` (the same JS without
  that rule; panel strips layered). See below for why it is out.
- a11y: the strips are `aria-hidden` like the faces; the `role=timer` labels are unchanged. Find-in-page sees
  `0123456789 0` per digit where the original has `0123456789`.

## Pixel identity (frozen frames, Chrome)

Harness `fixes/cd-strip/pixels.mjs`, adapted from countdown-faces' `probe.mjs pixels` and its review-r1 lessons.
- Virtual clocks for the countdown code; countdown rAF callbacks stepped by hand with jittered stamps; ticks land at
  grid + FR/3 (the target changes mid-frame).
- Scenarios: 60 Hz and 120 Hz; one step down and up; the 9 → 0 wrap and back through the 11th cell; a 4-unit carry;
  two changes mid-roll.
- Hero resume after an instant jump (scrollTo without smooth), first frame after fade-out at y = vh and after
  scrolling away, K = 6/15/40 frames (60 Hz) and 12/40 (120 Hz).
- Order: st6-rb2, strip, st6-rb2 again (the A/A).

| clock | arm vs st6-rb2 | shots | shots with any pixel difference | A/A (st6-rb2 vs itself) | raw |
|---|---|---|---|---|---|
| hero | strip (b) | 259 | **0** | 0 | `out/cd-strip/pixels-2026-10-03T00-17-10-586Z.json` |
| panel (morph held open, m = 1) | strip (b) | 169 | **1**: whole shot, max channel delta 1 (16059 px), the A/A's noise class | 2, same class (delta 1, 16059 px) | `out/cd-strip/pixels-2026-10-03T00-37-14-365Z.json` |
| panel | strip (a), layered | 169 | **67**: 21-32 px, max channel delta 131-204, moving frames only | (same run) | same file |

- State differences (strip 16 of 259 hero shots, 14 of 169 panel shots) are all 0.001 px readout rounding of the same
  positions (`11.969` vs `11.968`) with byte-identical shots.
- First-visible frames after resume: the frame index differs by one in both the A/B and the A/A (IntersectionObserver
  timing); the content is identical.
- Served sha256 (first 12): st6-rb2 JS `7bf7c4657d21` CSS `f523598b2a24`; strip (b) JS `358cd8ae16b9` CSS
  `ce6beca745a0`; strip (a) JS `358cd8ae16b9` CSS `305b8a705d8b`.
- Pitfall found on the way: at the end pin without the morph driven open, the panel is at m = 0 (opacity 0, blur
  12 px), and a panel pixel diff compares only what lies beneath it. The harness now opens the morph with
  `__fwMorphDrive({ hold: 1e9 })` first.
- `fix.mjs check cd-strip --viewport mobile`: OK (morph reached, 0 errors, 0 4xx; diff against the plain baseline,
  not st6-rb2: top 0.08 %, bottom 0.54 %).

## WebKit (iOS Simulator, counts only; Simulator ms never count, F-084)

Tool `fixes/cd-strip/sim.mjs` (adapted from countdown-faces' `x1.mjs`); arms served from immutable copies
(`fixes/cd-strip/snap.mjs`, hash-checked). iOS 26.5 Simulator (fw-sim 15 Pro Max), shared lane, weight simulator.
Raw: `out/cd-strip/sim/sim-2026-10-03T00-20-20-449Z.json`, `…00-47-25-402Z.json`, `…00-52-00-285Z.json`
(arm a only), `…01-03-03-384Z.json` (st6-rb2 and b, with the back-to-back census check).

**Hero clock at the top** (4 s Timeline windows, 4 ticks each; values per session where two are given):

| | st6-rb2 | strip (b) | strip (a) |
|---|---|---|---|
| clock layers (hero + panel) | 80 + 0 | 8 + 0 | 8 + 8 |
| page layers | 131 | 55 | 63 |
| clock backing memory | 1.18 MB | 2.10 MB | 4.16 MB |
| page layer memory | 52.77 MB | 53.69 MB (+0.92) | 55.75 MB (+2.98) |
| **hero clock Paint records (Timeline, 18x37 clips at the hero clock)** | **13, 13** | **0, 0** | 0, 0 |
| panel clock Paint records (17x36 clips at y 31: the unlayered panel at m = 0) | 3, 3 | 3, 4 | 0, 0 |
| hero clock layer paintCount delta between two censuses | 166-176 on 54 layers | 24 on 8 layers (3 each) | 24 (3 each) |

- The hero clock's Paint records (all 18x37 at the clock, x 341/359; y 415 is a face coming in from below) drop from 13
  per 4 s (4 ticks) to 0 in both sessions. The strip's layer content is painted once and only moves.
- **LayerTree paintCount is not a repaint measure here (measurement pitfall, OBSERVED, decisive local check).** The
  delta between two `layersForNode` censuses is the same for every layer, to the layer, whether the censuses are 117 ms
  or 4 s apart, with or without Timeline: st6-rb2 176 / 176 / 172, strip 24 / 24 / 24 (`sim-2026-10-03T01-03-03-384Z.json`,
  `ltBackToBack` vs `ltNoTimeline`/`lt`). So it counts the census itself (3 per backed layer, more on some), not the
  rolls. The "127-137 repaints per 4 s" in the brief (countdown-faces X1, the same probe) is probably the same
  artefact. The Timeline Paint records above are the measure. Posted to the board.
- The first session (`00-20-20`, no clip log yet) had 8 / 4 / 0 clock-sized Paint records (hero + panel together) for
  st6-rb2 / b / a.

**Morph** (M driver `__fwMorphDrive`, hold 2000 ms × 2 cycles under Timeline, calibrated with `console.timeStamp`;
2 sessions):

| | st6-rb2 (cdwc faces) | strip (b) | strip (a) |
|---|---|---|---|
| frames with a clock paint, first 450 ms of each tween (fwd, rev, fwd, rev) | 0 of 12-15 | 0 of 11-14 | 6-12 of 10-12, all 8 strips each, 56-104 strip-sized records |
| frames with a clock paint per ~1.4 s hold at m = 1 (3 sessions) | 26-35 of 77-78 | 14-27 of 75-79 | 2 of 77-79 |
| clock-paint hold frames, duration median / max (Sim ms, orientation only) | 16.6-16.8 / 25-26 | 16.9 / 26 | 43-50 (the 2 frames) |
| panel clock layers, paused and at the hold | 0 | 0 | 8 (2.06 MB), reason `willChange` |

- (b) keeps cdwc's 0 tween-start paints and has fewer clock-paint frames in the hold. Those frames are not long.
  The long hold frames (41-52 ms Sim) carry no clock paint, in every arm.
- (a) wins the steady hold, but repaints every strip on every frame of the panel's scale tween: the rects track
  `transform: scale(0.96 + 0.04·--morph)` (17x382 at 0.96, 18x396 at 1). That is a contents-scale re-raster
  (OBSERVED, not checked in WebKit source). Together with the Chrome pixel result, (a) is rejected (fix-nav-morph,
  the cdwc owner, agrees; no (a2)).
- On st6-rb2 the scene-pause will-change rule is an element list (CSS 11878ff, 11932-11934) that does not cover
  the countdown, so the paused panel keeps (a)'s strip layers. cdwc's rule (or (b)'s retarget) is the only thing
  that unlayers the panel clock on this stack.

## Cards (protocol v2)

```
CENSUS cd-strip · base st6-rb2 (JS 7bf7c4657d21, CSS f523598b2a24) · 2026-10-03
taken from de-gpu's census (research/gpu-props/README.md §0, C-026 F pair on st6-rb2; §G2) and countdown-faces X1:
| cluster | device | evidence |
| top window (hero clock rolling, y < ~1000) | phone F, Sim | X1 "127-137 face repaints per 4 s" (LayerTree paintCount: a census artefact, see WebKit section); Sim Timeline: 13 hero clock Paint records per 4 s (this README); y < 1000 holds 63 of 81 long moving frames (C-026) |
| morph pin | phone F | 91 of st6-rb2's long frames, median 20 ms there (C-026) |
```

```
ATTRIBUTION cd-strip · clusters: top window (hero clock), morph pin (panel clock) · verdict LOCATED
1 stage: paint recording (WebKit), on the clock layers
  evidence: Sim Timeline Paint records at the clocks, with clip rects (sim.mjs, raw above); LayerTree layer counts and
  memory (paintCount deltas are a census artefact, see above)
2 code: $E's 10 faces per digit (st6-rb2 JS ~4027-4084; transform per face KE(k, v)*c); a face that rolls into the
  clip repaints (F-142; clips at y 415 = a face entering from below); panel faces unlayered by cdwc (CSS 11953) repaint
  the digit area per spring frame
3 ablations: | arm | removes | role | mechanism check | result |
  | strip (b) | per-face layers, re-entry repaints | positive | Sim hero clock layers 80 -> 8, panel 0 layers | hero clock Paint records 13 -> 0 per 4 s (2 sessions); hold clock-paint frames 26-35 -> 14-27 of ~78; tween 0 -> 0 |
  | strip (a) | panel per-frame repaint (layers) | positive for the hold, negative for the tween | 8 panel layers (reason willChange); rects follow the panel's scale | hold -> 2 frames; tween 0 -> 6-12 of 12 |
  axis: time since a tick (roll) at the top; m (tween vs hold) at the pin. Decoupling run: none on the phone -> LOCATED
4 device class: render-bound / phone-only (WebKit paint). Chrome counts can't show it. A phone segment card (Timeline,
  >= 3 captures) is needed before any gain claim.
5 platform claims: | claim | status | reference | falls if wrong |
  | a composited layer outside its clip drops its backing store, repaints on re-entry (WebKit) | CONFIRMED | research/gpu-props §G2 (GraphicsLayerCA.cpp l.3034-3058, PlatformCALayerCocoa.mm l.728-739) | the hero part of the mechanism |
  | WebKit backs the whole strip (it always intersects the clip) | OBSERVED (Sim: 0.26 MB per strip = 18x396 CSS px at DPR 3) | Sim LayerTree memory | the memory estimate |
  | LayerTree paintCount deltas between censuses count the census, not the rolls | OBSERVED (decisive local check: same per-layer deltas 117 ms and 4 s apart) | sim-2026-10-03T01-03-03-384Z.json | nothing in this card (it uses Timeline Paint records); it does weaken the brief's 127-137 figure |
  | layered strips re-raster on every frame of the panel's scale tween | OBSERVED | Sim rects 17x382 -> 18x396 | only arm (a), rejected |
6 lead: <to sign>
fast path: "hero clock Paint records 13 -> 0 per 4 s, clock layers 80 -> 8, panel tween paints stay 0, pixels 0 px,
  by code ($E g-snippet -> one strip, JS ~4059-4075)"; the gain in frames is unknown until a phone segment card
```

```
BUILD cd-strip (b) on base st6-rb2 · overlay snapshot out/cd-strip/snap/strip
served hashes: JS 358cd8ae16b9…, CSS ce6beca745a0… (pixels.mjs and sim.mjs record them per run)
parity: frozen-frame diff 0 px (hero 259 shots), panel 1 noise-class shot of 169 (A/A has 2 of the same class)
a11y diff: none (strips aria-hidden like the faces; timer labels unchanged)
mechanism delta (Sim): hero clock layers 80 -> 8; page layers 131 -> 55; hero clock Paint records 13 -> 0 per 4 s;
  panel tween clock paints 0 -> 0; panel hold clock-paint frames 26-35 -> 14-27 of ~78
idle triple: not measured (same spring, same rAF, one transform write per rolling digit instead of 2-3 faces)
memory/layers: Sim clock backing 1.18 -> 2.10 MB, page layer memory +0.92 MB at the top; 0 panel clock layers
prediction: none yet
debug hooks: none added (st6-rb2's __fwMorphDrive is inherited)
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize ·
rubber band (all need a timed or phone run; the pixel harness covers the clock states, not these).

## Next

- Phone: a segment card (Timeline, ≥3 captures) at the top window and the pin, strip (b) vs st6-rb2 control, before any
  gain claim (slot ticket via the lead). Prediction first (`fixes/PREDICTIONS.md`).
- P-032 (fix-nav-morph) is re-registered on the strip build after the D card.
- fix-cd-roll-ca stacks on this patch (hero clock only; WAAPI roll driven via the strip's transform).

## Risks, conflicts, follow-ups

- Memory: WebKit backs whole strips, +0.9 MB per page at the top (Sim). Chrome rasterizes only visible tiles.
- countdown-faces (de-countdown): replaces its part (a). Its part (b) stacks unchanged; no restack planned.
- cdwc (fix-nav-morph): the panel rule is retargeted, not removed; the strip CSS sits next to it.
- Reduced motion: unchanged (the spring snaps; the strip jumps by whole cells).
- `.face.svelte-1quva9c` CSS stays in the file, unused.

## Files

`patch.diff` (arm b), `../cd-strip--a/patch.diff` (arm a, rejected), `pixels.mjs` (frozen-frame harness), `sim.mjs`
(Simulator counts), `snap.mjs` (immutable arm copies), `results.json`.
