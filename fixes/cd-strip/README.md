# Fix: cd-strip

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft, final build **strip-rw** (per-cell layers in an uncomposited wrapper re-based by one write; lead
decision 2026-10-03 05:0xZ after review round 2); pixel identity in Chrome and WebKit (Simulator) with one residual
delta-1 class under the 50 % hero fade (R-fade, put to the user, card below); WebKit counts on the Simulator; no timing
run (timing A/Bs are deferred, user 2026-10-02)
**Stage:** F (build card below), review round 2; user decision on R-fade pending. D: LOCATED, signed by the lead on the
fast path (2026-10-03 01:1xZ, no gain claim: the frame effect is measured only in the wave-2 phone run, so no phone
segment card now)
**Device class / gate:** render-bound / phone-only (WebKit paint and layer work; Chrome 6x can't stand in for it)
**Driver(s) behind the claims:** Simulator Timeline + LayerTree (counts only), Chrome and Simulator frozen-frame pixel
harnesses, idle triple (headless Chrome, counts; Layout and RecalcStyle counts from CDP `Performance.getMetrics`)
**Prediction:** P-072 in `fixes/PREDICTIONS.md`, drafted against the strip-rw build card; it stays a draft until the
user decides R-fade (lead 2026-10-03 05:5xZ), and is registered before any wave-2 or phone data. P-070 (written 01:12Z
for arm (b)) is **superseded before data: build changed (strip-cl → strip-rb → strip-rw, lead 04:4xZ and 05:0xZ)**;
its text stays unchanged.
**Topic:** G2 in `research/gpu-props/README.md` (F1 in its ranking; user T-030, highest priority). Base: **st6-rb2**
(`--on st6-rb2`). Replaces countdown-faces part (a) (the 3 slots); countdown-faces part (b), the hidden gate, stays
orthogonal (lead decision; de-countdown agrees).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (`$E`'s face snippet `g`, template `__cdStripT`, offset
function `__cdStripY` and nearest-cell helper `__cdStripM` next to `ZE`; overlay lines 4024-4087),
`/_app/immutable/assets/2.gBuqKVzi.css` (`.strip`/`.cdwrap`/`.cell` rules after `.face.svelte-1quva9c`, CSS 1422-1447;
the cdwc rule retargeted to `.strip` and the cell-layer rules, CSS 11964-11977).
**Final hashes (sha256):** `patch.diff` `48bc7adf7f03478622940d45d2daf9e9907f733db4350503151be97015b1dbfc`; served JS
`5e37af69bcc4b2aaa3b9c224d857bc2afb7014afb964ebb1b8a5dde072bf41f5`; served CSS
`9b2f89ea58bd76cb9d3b09f1c31d2c3dd74183586002951c3ff07c561b1811da` (base st6-rb2: JS `7bf7c4657d21`, CSS `f523598b2a24`).
The step before, strip-rb: `patch.diff` `08bedca68ac7…`, JS `56c075242353…`, CSS `9f90afa65888…`.

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

One static strip per digit replaces the 10 faces (`patch.diff`, +72 −22 on st6-rb2). The final build is **strip-rw**
(lead decision 2026-10-03 05:0xZ, review round 2). Steps before it: strip-rb (per-cell tops re-based, 11 writes per m
change, lead pick 04:3xZ), then strip-rw (one wrapper write per m change). strip-rb's numbers stay below as the step
before.

- `span.strip` (absolute, inset 0, `will-change: transform`) holds an uncomposited `span.cdwrap` of the same box, which
  holds 11 `span.cell`s `0 1 … 9 0`. Each cell is a face's box (absolute, `height: 100%`, glyph centred by the same
  flex rules) at `top: k·c px`, written once (and again only if c changes). `c` is the spacer's integer
  `offsetHeight`, the same value the original multiplies `KE` by.
- **Each hero cell is its own layer** (`.cell.svelte-1quva9c { will-change: transform }`; panel cells
  `will-change: auto`, next to cdwc's strip rule). WebKit rasterizes a text backing taller than one cell with glyph
  edges 1-3 levels lighter than a face's (OBSERVED, Simulator, cause unknown; section "Pixel identity … WebKit"). A
  one-cell backing per cell is pixel-identical.
- **Re-based geometry.** n = v mod 10 and m = `__cdStripM(v)` = round(n).
  - The strip moves by `translateY(__cdStripY(v, c) + m·c px)`, with `__cdStripY = (v, c) => -(((v % 10) + 10) % 10) * c`
    unchanged. That offset stays under one cell.
  - The wrapper sits at `top: −m·c px`. It is the one write when m changes; Svelte's template effect compares its
    derived inputs by equality, so the effect re-runs only when c or m changes.
  - Each cell layer therefore sits (k − m)·c from the strip layer and lands at `(k − n)·c` on screen. That is the same
    place as a −n·c transform over tops k·c, without two large offsets cancelling in the layer tree. With them, WebKit
    showed a delta-1 glyph-edge difference under the hero's exit fade late in a long roll (OBSERVED, cause unknown).
  - strip-rb did the re-base by rewriting all 11 cell tops to (k − m)·c. That is 11 style writes per m change, and m
    changes on every tick while the clock is hidden (st6-rb2 snaps there). In Chrome it was 22-24 writes per s at the
    end pin vs the faces' 6-7. The wrapper makes it one write.
- For the two cells inside the digit, `(k − n)·c` is exactly `KE(k, v)·c`, the original face's offset. The 11th cell
  (`0`) is a guard only: `$E` restarts the spring at velocity 0 on every target
  change and its damping ratio is about 0.98, so the value never leaves [0, 9] (review-cd-strip checked every
  start/target pair, a second target at frames 1-30 and frame intervals 4-33 ms offline: min 0, max 9), and 9 → 0
  rolls back through 8 … 1 in both arms. Cell 10 is never shown with this spring. The text never changes.
- **What it does not remove:** a cell layer that leaves the clip loses its backing like a face did, so the F-142
  re-entry paints come back. Each rolling digit gets about 1-3 Paint records per roll, the same as with the faces
  (OBSERVED, Simulator; section "WebKit"). The gain is elsewhere: fewer backed layers and less backing memory, and
  fewer Paint records on re-entry to the top (strip-rb: 48 → 16 backed, 1.18 → 0.39 MB, 54-55 → 23-41 in the first
  second; strip-rw: section "WebKit").
- The spring (`GE`), its rAF loop, st6-rb2's pause/snap while hidden and the `animate`/`active` props are untouched.
  The value → offset mapping lives in two functions (`__cdStripY`, `__cdStripM`) and three template effects (cell tops
  on c; wrapper top on c and m; strip transform), so fix-cd-roll-ca can drive the strip from outside (JS 4067-4086).
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
- Scenarios: 60 Hz and 120 Hz; one step down and up; the ones wrap 0 → 9 and 9 → 0 (both roll through 8 … 1, cell
  10 never shows, see above); a 4-unit carry; two changes mid-roll.
- Hero resume after an instant jump (scrollTo without smooth), first frame after fade-out at y = vh and after
  scrolling away, K = 6/15/40 frames (60 Hz) and 12/40 (120 Hz).
- Order: st6-rb2, strip, st6-rb2 again (the A/A).

| clock | arm vs st6-rb2 | shots | shots with any pixel difference | A/A (st6-rb2 vs itself) | raw |
|---|---|---|---|---|---|
| hero | strip (b) | 259 | **0** | 0 | `out/cd-strip/pixels-2026-10-03T00-17-10-586Z.json` |
| panel (morph held open, m = 1) | strip (b) | 169 | **1**: whole shot, max channel delta 1 (16059 px), the A/A's noise class | 2, same class (delta 1, 16059 px) | `out/cd-strip/pixels-2026-10-03T00-37-14-365Z.json` |
| panel | strip (a), layered | 169 | **67**: 21-32 px, max channel delta 131-204, moving frames only | (same run) | same file |
| hero + panel + herofade | strip-cl (cell layers, no re-base) | 512 | 1 panel shot of the background class (delta 1, 16059 px) | 0 | `pixels-2026-10-03T03-02-05-000Z.json` |
| panel | strip-cl and strip (b) | 169 each | **0** and **0** | 0 | `pixels-2026-10-03T03-34-02-051Z.json` |
| hero + panel + herofade | strip-rb (measurement copy, JS `ab25aa01f469`) | 512 | hero and herofade **0**; 4 panel shots of the background class | 1, same class | `pixels-2026-10-03T04-15-39-058Z.json` |
| panel | strip-rb final bytes (JS `56c075242353`, CSS `9f90afa65888`) | 169 | 2 of the background class | 1, same class | `pixels-2026-10-03T04-56-46-997Z.json` (review round 2 (c)) |
| hero + panel + herofade | **strip-rw (final build**, JS `5e37af69bcc4`, CSS `9b2f89ea58bd`) | 512 | hero **0**, panel **0**; herofade 6: 5 of the A/A's 0.75-fade settling class (38-64k px, delta 4-10) and one 0.9-fade shot of 23 px delta 1 that the A/A has identically | 7: the same 5 settling shots (40-74k px, delta 7-13), the same 23 px, and 8 px at 0.9 | `pixels-2026-10-03T06-09-16-872Z.json` (review round 2 (b), (c)) |

**The panel's background class.** A channel delta of 1 on 16059 px of the 1152x288 crop, spread over the whole crop
(bbox = the crop), with the same digit state in both shots. The pattern is byte-for-byte the same whether it turns up in
a faces shot or a strip shot: the same pixel count and the same per-column histogram. So it is one alternate raster
state of Chrome's panel, not a digit difference. Which arm's shot is the odd one out (bgloc over the shots):
- strip-rb final-bytes run (04-56): faces 1, strip 1, faces again 0;
- strip-rb copy run (04-15): faces 1, strip-rb 3, faces again 0.

- strip-rw run (06-09): faces 0, strip-rw 0, faces again 0.

The third run (the decisive check) has the class in no arm; in the last two runs the strip arm never stands alone
in it. It is a Chrome panel raster state, not a strip difference (OBSERVED, cause unknown).

- State differences (strip 16 of 259 hero shots, 14 of 169 panel shots) are all 0.001 px readout rounding of the same
  positions (`11.969` vs `11.968`) with byte-identical shots.
- First-visible frames after resume: the frame index differs by one in both the A/B and the A/A (IntersectionObserver
  timing); the content is identical.
- Served sha256 (first 12): st6-rb2 JS `7bf7c4657d21` CSS `f523598b2a24`; strip (b) JS `358cd8ae16b9` CSS
  `ce6beca745a0`; strip (a) JS `358cd8ae16b9` CSS `305b8a705d8b`.
- Pitfall found on the way: at the end pin without the morph driven open, the panel is at m = 0 (opacity 0, blur
  12 px), and a panel pixel diff compares only what lies beneath it. The harness now opens the morph with
  `__fwMorphDrive({ hold: 1e9 })` first. The two m = 0 panel runs (`pixels-2026-10-03T00-22-15-492Z.json`,
  `…00-23-51-037Z.json`; their A/A differs in 169 of 169 shots too) are void and superseded by `…00-37-14-365Z`.
- The hero run (`00-17-10`) ran at load1 87-89 at its start (64, 40 later; shared slot). That does not matter for
  hand-stepped frames, but the resume first-visible frame index (an IntersectionObserver timing) differed in 6 A/B vs
  3 A/A cases; the content of those frames is identical.

**Review round 1, B2: in-between states** (`out/cd-strip/pixels-2026-10-03T01-26-37-707Z.json`, 147 shots per arm,
60 Hz, scenarios: one step down, the 0 → 9 wrap with a tens carry, two changes mid-roll; frames 0-60 after the tick).
- Panel at m = 0.25 / 0.5 / 0.75 (`--morph` set by hand on the element Svelte binds it to, after the morph was driven
  open; computed panel scale 0.97 / 0.98 / 0.99, blur 9.17 / 5 / 0.83 px, opacity 0.24 / 0.58 / 0.93; same in all
  three arms): **0 of 63 shots differ**, A/A 0.
- Hero during its exit fade, scrolled to 0.25 / 0.5 / 0.75 / 0.9 of the viewport (clock opacity 0.75 / 0.5 / 0.25 /
  0.10), with a rolling digit:
  - 0.25 and 0.5: **0 of 42 shots differ**, A/A 0.
  - 0.75: the first 5 shots of the first scenario differ by 35-64k px (max delta 4-11) in the A/B **and** in the A/A
    (the page behind the fading clock still settling after the scroll); the other 16 are 0 in both.
  - 0.9 (opacity 0.10): **7 A/B-only shots with a channel delta of 1**: 13 px at rest (the same 13 px in 5 shots of the
    two-changes scenario, frames 4-60), 83 and 106 px mid-roll. Two more shots of delta 1 (8 and 23 px) appear in the
    A/A as well. **This is a visible-pixel difference by the strict rule**: delta 1 of 255 on at most 106 px of a clock
    that is 90 % transparent (not perceptible, but not byte-identical). Cause not found (OBSERVED, in our setup).
- `panelAnims` (animations the harness paused at the open panel) is 58 for st6-rb2 (43 in the `00-37-14` run) and 36
  for the strip (Chrome). The cause is unknown. It does not change any pixel above, because the panel shots are identical.
- `fix.mjs check cd-strip --viewport mobile` on strip-rw (06-29Z): OK (morph reached, 0 errors, 0 4xx; diff against the
  plain baseline, not st6-rb2: top 0.19 %, middle 0, bottom 0.53 %; the first build: 0.08 / 0.54 %).

## Pixel identity (frozen frames, WebKit on the iOS Simulator; review round 1, B1)

Harness `fixes/cd-strip/simpx.mjs`: the pixels.mjs clock shim (the countdown's own clocks virtual, its rAF frames
stepped by hand), real Simulator screenshots (`simctl io screenshot`, 1290x2796, the composited screen, so WebKit's
layers and backing stores are in them), cropped to the clock (+4 CSS px), with a marker calibrating the crop. Passes:
hero at y 0 (17 shots: step 0/2/4/8/15/30, wrap 0/3/6/12/30, wrap up 3/8, two changes 4/10/14/30), panel at m = 1 and
m = 0.5 (6 + 6; the morph opened by `__fwMorphDrive`, then `--morph` and the panel's own transform/filter/opacity
pinned inline, because WebKit's panel transform did not follow a hand-set `--morph`: OBSERVED, cause unknown), fade50
/ fade90 (hero scrolled to 0.5 / 0.9 of the viewport: clock opacity 0.55 / 0.18; fade50x = 13 shots). Arms st6-rb2,
candidate, st6-rb2 again (A/A), from the hash-checked snapshots. Counts only, shared lane.

**The strip as first built (one 11-cell text layer per digit) is not identical in WebKit:**

| pass | strip vs st6-rb2 | A/A |
|---|---|---|
| hero (2 runs) | 17/17 shots differ, 719-941 px, max delta 2-3, on glyph edges | 0 |
| panel m = 1 + m = 0.5 (unlayered strips) | 0/22 | 0 |
| fade50 | 5/5, 484-600 px, delta 1-2 | 2/5, 42 px, delta 1 (a label below the digits) |
| fade90 | 0/5 | 0/5 |

Hunt (`simpx.mjs … variants`, clocks at rest, one shot per variant; raw `out/cd-strip/simpx/simpx-2026-10-03T02-*.json`):
the element, text and strip rects agree with the faces' to 1e-4 device px. Every variant whose composited text
backing is taller than one cell differs (2, 3, 4, 6, 8, 11 cells tall at identity: 864-1616 px, delta 2-3; the strip
offset by one cell; the remainder shifts; a clipped strip; no strip layer), whatever the transform. Only one-cell
backings match: the visible cell alone at identity, and one layer per cell. So **a text backing taller than one cell
rasterizes with glyph edges 1-3 levels lighter in WebKit (OBSERVED, in our setup, cause unknown; the LayerTree
protocol names no backing format, and every size measures 4.1 bytes per device px, so a format switch is not the
explanation)**. A split strip cannot be identical.

**Cell layers alone (strip-cl: `.cell { will-change: transform }`, panel cells `auto`)**: hero 0/17 (2 runs), panel
0/12, fade90 0/5, but fade50 keeps a glyph-edge delta in the late phase of a long roll: 36 and 83 px of delta 1 at
"two changes, frame 30" in two runs (A/A 0 there), 10 px at frame 25. Re-basing that frozen frame (strip translateY
reduced to its fractional part, cells re-topped at (k − m)·c: the same geometry with no large offsets cancelling)
removes it (`simpx-2026-10-03T04-02-08-845Z`). So the delta follows the large cancelling offsets −n·c + k·c (OBSERVED,
cause unknown; float precision in the compositor is a guess, not checked in source).

**Re-based cell layers (strip-rb)** vs st6-rb2, A/A on the same shots:

| pass | strip-rb | A/A | raw |
|---|---|---|---|
| hero, opacity 1 | 0/17 | 0 | `simpx-2026-10-03T04-06-29-382Z` |
| fade50x (13 shots) | 4 shots, all at the A/A's places with the same or a larger A/A count (a label below the digits: 42 px; one glyph-edge spot, 55 px, that the A/A shows too); "two, frame 30": 0 | 4 | same |
| fade90 | 0/5 | 0 | same |
| panel m = 1 + m = 0.5 | 0/12 | 0 | `simpx-2026-10-03T04-27-02-825Z` |
| **final hash** (JS `56c075242353`, CSS `9f90afa65888`): hero + fade50x (30 shots) | **0/30** | 0/30 | `simpx-2026-10-03T04-39-57-971Z` |

The rows above the last one ran on the measurement copy `strip-rb` (JS `ab25aa01f469`, CSS `757bc2e35c96`). Its
code is the same as the final build's: the final build only names the helper `__cdStripM` and rewrites comments. The
last row confirms hero and fade50x on the final bytes. In that run, fade50x showed no A/A spot either.

**strip-rw (the final build: JS `5e37af69bcc4`, CSS `9b2f89ea58bd`)** vs st6-rb2, A/A on the same shots:

| pass | strip-rw | A/A | raw |
|---|---|---|---|
| hero, opacity 1 | 0/17 | 0 | `simpx-2026-10-03T05-17-45-723Z` |
| fade90 | 0/5 | 0 | same |
| panel m = 1 / m = 0.5 | 0/6 / 0/6 | 0 | same |
| fade50x (13 shots), session 1 | 4: the 42-px label spot ×2; seconds-ones digit at "two, f14" 13 px and "two, f30" 47 px | 4: label ×3; digit at "two, f14" 4 px | same |
| fade50x, session 2 (with strip-rb final bytes in the same session) | 5: label ×3, label-row 31 px (x 588-702) at "wrap, f30"; digit at "two, f10" 11 px | 3: label ×3 | `simpx-2026-10-03T05-39-59-608Z` |
| (same session) strip-rb final bytes | 4: label ×1, label row 73 px at "wrap, f30"; digit at "two, f10" 11 px and "two, f14" 55 px | (as above) | same |

**The wrapper is not composited** (Sim LayerTree at the top, before and after the 4 s window: 16 `.cdwrap` nodes,
0 layers, so `reasonsForCompositingLayer` has no layer to report; OBSERVED, Simulator; `sim-2026-10-03T05-39-37-736Z`).

**Residual R-fade: a delta-1 class at the seconds-ones digit under the 50 % fade, mid-roll.** Every difference is a
channel delta of 1 (of 255) on the rolling seconds-ones digit (CSS x 361-374, device y 1309-1413). It shows only in
frozen frames 10-30 of a roll (about 170-500 ms after a tick) with the hero clock at opacity 0.55 (scrolled to half
the viewport), in one frame at a time (8-17 ms at 120-60 Hz); at rest, at opacity 1, 0.18 and in the panel it is 0.
The A/A shows the same class: the 11-px pattern at "two, f10" in two A/A sessions and the 55-px pattern at "two, f14"
in one. Pooled over every Sim fade50x session (`node fixes/cd-strip/pool.mjs`, shots compared against the session's
first faces arm):

| arm | shots with a digit-row difference | of which A/A also shows the identical pattern in some session | label-row (42/31/73 px) |
|---|---|---|---|
| faces again (A/A) | **4 / 65** (6 %; 5 sessions) | - | 12 / 65 |
| strip-rw | **3 / 26** (12 %; 2 sessions): 13, 47, 11 px | 1 (the 11 px) | 6 / 26 |
| strip-rb final bytes | 2 / 26 (8 %; 2 sessions): 11, 55 px | 2 | 2 / 26 |
| strip-rb copy | 1 / 13: 55 px (the A/A had the same 55 px in that session) | 1 | 3 / 13 |
| strip-cl (no re-base) | 2 / 13 in fade50x, 1 / 5 in fade50: 11, 83, 36 px | 1 | 2 / 18 |

The one shot that only the strips have shown is "two, frame 30": strip-cl 2 of 2 sessions (36, 83 px), strip-rw 1 of
2 (47 px), strip-rb 0 of 3, A/A 0 of 8 (fade50 and fade50x sessions). 3 of 26 vs 4 of 65 is not a separable rate at these counts, but it is not
byte-identity either, so it is put to the user (card below). Cause unknown (OBSERVED, in our setup).

## Idle triple (review round 1, B4)

`fixes/cd-strip/idle.mjs` (adapted from scene-scope's `idletriple.mjs`): headless Chrome at 430x932 DPR 3, CPU 1x, 2 s settle then
5 s windows with no input at the top (y 0), mid (y 2620, reached in 250 px steps) and end (y 5345, the morph pin). Both arms in the same shared slot, 2 rounds, order st6-rb2, strip,
strip, st6-rb2. Served st6-rb2 `7bf7c4657d21`/`f523598b2a24`, strip `358cd8ae16b9`/`ce6beca745a0`. Raw
`out/cd-strip/idle-2026-10-03T01-27-41-309Z.json`. Counts per second, st6-rb2 / strip (two rounds each):

| spot | callbacks | rAF | timers, observers, events, nodes | writes | style writes |
|---|---|---|---|---|---|
| top | 44.4, 37.6 / 45.4, 45.6 | 32.8, 26 / 33.8, 33.8 | equal | 88.4, 70.8 / 49.8, 49.8 | 76, 58.4 / 37.4, 37.4 |
| mid | 9.4, 9.4 / 9.4, 9.6 | 0 / 0 | equal | 22.6, 17 / 13.4, 13 | 11.2, 6 / 2.4, 2 |
| end | 7, 7 / 7, 7 | 0 / 0 | equal | 11.2, 10.6 / 6.4, 6 | 7.2, 6.6 / 2.4, 2 |

- That table is the first build (one strip layer per digit, tops fixed at k·c). There, style writes fall everywhere:
  one transform per digit and frame instead of one per face in view.

**strip-rw (the final build: JS `5e37af69bcc4`, CSS `9b2f89ea58bd`)**, same tool and order, now with Chrome's
`LayoutCount` and `RecalcStyleCount` deltas over each window (CDP `Performance.getMetrics`, counts only), raw
`out/cd-strip/idle-2026-10-03T06-25-10-812Z.json` (shared lane, load1 4-8; review round 2 (d)). Per second, st6-rb2 /
strip-rw, two rounds each:

| spot | callbacks | rAF | observers | writes | style writes | Layout (LayoutCount) | RecalcStyle |
|---|---|---|---|---|---|---|---|
| top | 45, 37.6 / 46.2, 44.8 | 33.4, 26 / 33.8, 32.6 | 1.6, 1.6 / **2.2, 2.2** | 88.8, 70.8 / 52.2, 51 | 76.4, 58.4 / **39.8, 38.6** | 2.4, 2 / **5, 5.2** | 54.4, 54.4 / 54.2, 53.8 |
| mid | 9.4, 9.4 / 9.4, 9.4 | 0 / 0 | 0 / 0 | 18.2, 17 / 14.2, 13 | 7.2, 6 / **2.8, 2** | 1, 1 / **3, 2.8** | 24.2, 36.2 / 24, 31.8 |
| end | 7, 7 / 7, 7 | 0 / 0 | 0 / 0 | 10.6, 15.6 / 6.2, 6 | 6.6, 11.2 / **2.2, 2** | 0, 0 / **1, 1** | 60, 60 / 60, 60 |

- **Style writes are lower at every spot** (top 38.6-39.8 vs 58.4-76.4, mid 2-2.8 vs 6-7.2, end 2-2.2 vs 6.6-11.2):
  one transform per digit and frame, plus one wrapper write per m change, instead of one transform per face in view.
  strip-rb's +20 writes per s at mid and end are gone.
- **Layout counts are higher at every spot**: about +3 per s at the top, +2 at mid, +1 at the end, both rounds. The
  wrapper's `top` write moves a positioned box, which needs a layout; a face only changes its transform. At mid and
  end the clocks are hidden and st6-rb2 snaps the value on every tick, so m changes once per tick for the changed
  digit (hero and panel clocks): that matches +1-2 per s. RecalcStyle counts are equal. The cost per layout was not
  measured (timing deferred); the Simulator's top-window Layout records are equal, and one of its two m = 1 holds
  at the pin is +8 above the A/A (section "WebKit").
- Observer callbacks at the top: 2.2 vs 1.6 per s in both rounds (strip-rb 4 and 2.6; the first build 1.6). Which
  observer fires was not checked (OBSERVED, cause unknown).
- Timers, events and nodes are equal; rAF at the top again follows how the ticks fall in the window.

**strip-rb, the step before (JS `56c075242353`, CSS `9f90afa65888`)**, same tool and order, raw
`out/cd-strip/idle-2026-10-03T04-58-19-565Z.json` (load1 2-4). Writes per second, st6-rb2 / strip-rb, two rounds each:

| spot | callbacks | rAF | writes | style writes |
|---|---|---|---|---|
| top | 44.2, 37.8 / 54.2, 39.4 | 32.6, 26.2 / 40.2, 26.8 | 88, 70.8 / 107.8, 63.6 | 75.6, 58.4 / 95, 51.2 |
| mid | 9.4, 9.4 / 9.4, 9.4 | 0 / 0 | 17, 34.6 / 33, 33 | 6, 22.4 / 22, 22 |
| end | 7, 7 / 7, 7 | 0 / 0 | 10, 11.2 / 26, 28.2 | 6, 7.2 / 22, 24.2 |

- **Style writes were not lower on strip-rb.** At the top they fall within the faces' own spread (51.2-95 vs
  58.4-75.6). At the end pin they are about 3 times as many (22-24.2 vs 6-7.2 per s). At mid they match the faces'
  higher round. The cause is the re-base: while the clock is hidden, st6-rb2 snaps the value on every tick, m
  changes for each changed digit, and the top effect rewrites all 11 cell tops. It does this in the hero and in the
  panel clock, about +20 writes per s. In WebKit at the top these writes add no Layout or RecalculateStyles
  records: the counts per 4 s are the same in all arms (section "WebKit"). The cost per record was not measured.
- Timers, observers, events and nodes are equal. The rAF count at the top again follows how the ticks fall in the
  window (faces 26.2-32.6, strip 26.8-40.2).
- rAF at the top is 33.8 for the strip vs 26-32.8 for st6-rb2. This is the same spring loop: it runs only while a digit
  rolls, so the per-window count follows how the 1 Hz ticks fall in the 5 s window, and st6-rb2's two rounds differ by
  6.8 between themselves. It is 1 per second above st6-rb2's higher round. That is not a new rAF source.
- load1 was 21-70 during the slot (shared); these are counts, not timings.

## WebKit (iOS Simulator, counts only; Simulator ms never count, F-084)

Tool `fixes/cd-strip/sim.mjs` (adapted from countdown-faces' `x1.mjs`); arms served from immutable copies
(`fixes/cd-strip/snap.mjs`, hash-checked). iOS 26.5 Simulator (fw-sim 15 Pro Max), shared lane, weight simulator.

**strip-rw (the final build: JS `5e37af69bcc4`, CSS `9b2f89ea58bd`)**, one session (06:21Z, 151 s), arms st6-rb2
(faces), strip-rw, st6-rb2 again (A/A); phases top, scroll, morph; raw `out/cd-strip/sim/sim-2026-10-03T06-21-41-635Z.json`
(review round 2 (d), (e)). The wrapper census is from the G2 session (`sim-2026-10-03T05-39-37-736Z`).

| | faces (st6-rb2) | strip-rw | faces again (A/A) |
|---|---|---|---|
| hero clock layers (backed) | 80 (48) | 96 (16) | 80 (48) |
| hero clock backing memory | 1.18 MB | **0.39 MB** | 1.18 MB |
| wrapper (`.cdwrap`) layers | - | **0** of 16 nodes | - |
| clock Paint records, first 1 s after re-entry | 54 | **23** | 55 |
| clock Paint records, 1-3.5 s after re-entry | 5 | 3 | 11 |
| Layout / RecalculateStyles records, top 4 s | 178 / 229 | 179 / 228 | 180 / 228 |
| hero clock Paint records, top 4 s | 8 | 17 | 8 |
| morph tweens: frames with a clock paint, first 450 ms (fwd, rev, fwd, rev) | 0 of 13-15 | 0 of 13-15 | 0 of 12-14 |
| morph tweens: Layout per tween | 28-33 | 27-31 | 26-30 |
| **morph hold at m = 1 (two holds of ~1.4 s): Layout** | 102, 102 | **106, 114** | 104, 106 |
| morph hold: RecalculateStyles | 179, 179 | **184, 191** | 182, 184 |
| morph hold: frames with a clock paint | 26, 27 of 78 | 29, 34 of 77-78 | 28, 30 of 78-79 |
| panel clock layers at the hold | 0 | 0 | 0 |
| rAF callbacks, top 4 s | 107 | 140 | 106 |

- **Gains (OBSERVED, Simulator):** hero clock backing 1.18 → 0.39 MB (48 → 16 backed layers); clock Paint records in
  the first second after re-entry 54-55 → 23 (strip-rb: 25; cell layers 23, 23, 23 in earlier sessions).
- **No gain:** idle Paint at the top (17 vs 8 and 8 here; strip-rb 12 vs 13 and 4): it follows how many digits roll
  in the window; a rolling digit still repaints 1-3 cells per roll (F-142). Top Layout and RecalculateStyles: equal.
- **A possible small cost at the pin:** in one of two m = 1 holds, strip-rw is above the A/A's range by 8 Layout,
  7 RecalculateStyles records and 4 clock-paint frames (the other hold is inside it). A plausible mechanism, not
  checked: the wrapper's `top` write is a layout move, about once per roll per changed digit, where a face only
  changes its transform. One session; not separable from the A/A spread at this count.
- The rAF count at the top again follows how the ticks fall in the window (strip-rb sessions: 107 vs 142 and 106).
- **History: strip-rb (the step before)** below. Its 11 top writes per m change are gone in strip-rw (one wrapper
  write); the Chrome idle triple counts them.

**strip-rb, the step before (JS `56c075242353`, CSS `9f90afa65888`)**, one session, arms st6-rb2 (faces), strip-rb,
st6-rb2 again (A/A), raw `out/cd-strip/sim/sim-2026-10-03T04-38-35-168Z.json` (review round 2 (b) and (d)). "Top" =
a 4 s Timeline window at y 0 (4 ticks). "Scroll" = 1 s at the top, scroll to 3 viewports, 2.5 s away, back to 0,
2.5 s; "re-entry" is the first 1 s back at the top, marked by `console.timeStamp`.

| | faces (st6-rb2) | strip-rb | faces again (A/A) |
|---|---|---|---|
| hero clock layers (backed) | 80 (48) | 96 (16) | 80 (48) |
| hero clock backing memory | 1.18 MB | **0.39 MB** | 1.18 MB |
| page layers / page layer memory | 127 / 52.77 MB | 147 / 51.98 MB | 127 / 52.77 MB |
| Layout / RecalculateStyles records, top 4 s | 178 / 230 | 178 / 230 | 178 / 229 |
| hero clock Paint records, top 4 s (18x37 clips) | 13 (9 of them at y 415: a face entering from below) | 12 | 4 |
| panel clock Paint records, top 4 s (17x36 at y 31, panel at m = 0) | 3 | 4 | 4 |
| clock Paint records, first 1 s after re-entry | 54 | **25** | 54 |
| clock Paint records, 1-3.5 s after re-entry | 3 | 9 | 3 |
| rAF callbacks (FireAnimationFrame), top 4 s | 142 | 107 | 106 |
| top-level script records (rAF, timers, calls, events), top 4 s | 162 | 127 | 126 |
| script ms, top 4 s (Sim ms, orientation only) | 14.0 | 15.5 | 14.2 |

Earlier sessions with the same geometry (measurement copies `strip-cl` = cell layers without the re-base, and
`strip-rb` before the helper was named; raw `sim-2026-10-03T04-*`), clock Paint records in the first 1 s after
re-entry: faces 55; cell layers 23, 23, 23; strip-rb 41 (that window held a multi-digit carry) and 24. Top 4 s hero
clock Paint records: faces 13, 13, 13, 4; cell layers 4 and 13; strip-rb 41 (the carry window).

- **What strip-rb gained in WebKit (OBSERVED, Simulator):** hero clock backing 1.18 → 0.39 MB (48 → 16 backed
  layers); clock Paint records in the first second after re-entry 54-55 → 23-41; fewer style writes (Chrome idle triple
  below). **What it does not gain:** idle Paint at the top. Each cell layer that leaves the clip loses its backing,
  like a face did (F-142), so a rolling digit still repaints 1-3 cells per roll: 4-13 hero clock Paint records per 4 s
  in both the faces and the strip arms, depending on how many digits roll in the window (session variance; the faces
  arm itself ranges 4-13). Layout and RecalculateStyles record counts are the same in all three arms.
- **Script cost of the derived round() (review round 2 (d)).** Per digit and spring frame, the strip evaluates
  `__cdStripM(v)` twice: once as the top effect's dependency and once in the transform. That is two `Math.round` calls
  and a modulo. The 11 tops are written only when m changes. The Timeline cannot see the calls apart from the rAF
  callback that makes them. Per 4 s at the top: top-level script records 127 (strip-rb) vs 126 and 162 (faces, two
  runs), rAF callbacks 107 vs 106 and 142. Script time is 15.5 vs 14.0 and 14.2 Sim ms; Simulator ms are for
  orientation only (F-084). No script cost shows above the faces' own run-to-run spread. The faces' 142 vs 106 rAF
  callbacks come from how the ticks fall in the window.
- **History: the first build, one strip layer per digit (not identical).** That build had 8 hero clock layers and
  0 hero clock Paint records per 4 s (13 → 0 in two sessions: `sim-2026-10-03T00-47-25-402Z.json`,
  `…01-03-03-384Z.json`). It is out because its glyph edges differ from the faces' (section "Pixel identity …
  WebKit"). The final build gives that idle gain up for pixel identity, and the D card's "13 → 0" no longer holds
  for the final build.
- **LayerTree paintCount is not a repaint measure here (measurement pitfall, OBSERVED, decisive local check).** The
  delta between two `layersForNode` censuses is the same for every layer, to the layer, whether the censuses are 117 ms
  or 4 s apart, with or without Timeline. Examples: st6-rb2 176 / 176 / 172 and strip 24 / 24 / 24
  (`sim-2026-10-03T01-03-03-384Z.json`, `ltBackToBack` vs `ltNoTimeline`/`lt`); the final session repeats it (faces
  179 / 179, strip-rb 133 / 133). So it counts the census itself (3 per backed layer, more on some), not the rolls.
  The brief's "127-137 repaints per 4 s" (countdown-faces X1, the same probe) is this artefact, not a repaint count
  (F-149). The Timeline Paint records above are the measure.

**Morph** (M driver `__fwMorphDrive`, hold 2000 ms × 2 cycles under Timeline, calibrated with `console.timeStamp`;
3 sessions per arm: st6-rb2 and (b) `00-20-20`, `00-47-25`, `01-03-03`; (a) `00-20-20`, `00-47-25`, `00-52-00`).
These rows are from the first build (one strip layer per hero digit). In the panel, the final build is the same as
(b): panel strips and panel cells unlayered, the same 11 text cells. Only the cells' tops differ ((k − m)·c instead
of k·c). The morph counts were not re-run on the final hash; the panel's pixel identity was (0/12, section above).

| | st6-rb2 (cdwc faces) | strip (b) | strip (a) |
|---|---|---|---|
| frames with a clock paint, first 450 ms of each tween (fwd, rev, fwd, rev) | 0 of 12-15 | 0 of 11-15 | 6-12 of 10-12, all 8 strips each, 56-104 strip-sized records |
| frames with a clock paint per ~1.4 s hold at m = 1 | 26-35 of 77-78 | 14-27 of 75-79 | 2 of 77-79 |
| clock-paint hold frames, duration median / max per hold (Sim ms, orientation only; `00-47-25`, `01-03-03`) | 16.6-16.8 / 17.7-25.8 | 16.6-16.9 / 17.5-26.2 | 43-67 (the 2 frames) |
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
6 lead: SIGNED on the fast path, 2026-10-03 01:1xZ, no gain claim ("hero clock Paint records 13 -> 0 per 4 s, clock
  layers 80 -> 8, panel tween paints stay 0, pixels 0 px, by code ($E g-snippet -> one strip, JS ~4059-4075)"). The
  gain in frames is measured only in the wave-2 phone run (P-070), so no phone segment card is needed now.
  (Since then the build changed to strip-rw: the 13 -> 0 and 80 -> 8 figures belong to the first build, see section
  "WebKit"; P-070 is superseded before data by the P-072 draft.)
```

```
BUILD cd-strip strip-rw on base st6-rb2 · overlay snapshot out/cd-strip/snap/strip · 2026-10-03
served hashes: JS 5e37af69bcc4b2aaa3b9c224d857bc2afb7014afb964ebb1b8a5dde072bf41f5,
  CSS 9b2f89ea58bd76cb9d3b09f1c31d2c3dd74183586002951c3ff07c561b1811da; patch.diff 48bc7adf7f03…
  (base st6-rb2 JS 7bf7c4657d21, CSS f523598b2a24; snapshot b1789284481295-4ad4a84a)
structure: per digit one strip layer (will-change: transform) > one uncomposited wrapper (top -m*c; Sim: 0 layers of
  16 nodes) > 11 cells (hero: one layer each; panel: unlayered, cdwc retargeted)
parity: Chrome hero 0, panel 0, herofade only the A/A's own classes (512 shots, 06-09Z); Simulator hero 0/17,
  fade90 0/5, panel 0/12; fade50x: residual R-fade (USER DECISION card)
a11y diff: none (strips aria-hidden like the faces; timer labels unchanged)
mechanism delta (Sim, 06-21Z, faces / strip-rw / A/A): hero clock backed layers 48 / 16 / 48, backing 1.18 / 0.39 /
  1.18 MB; clock Paint records in the first 1 s back at the top 54 / 23 / 55; top 4 s Layout 178 / 179 / 180,
  RecalculateStyles 229 / 228 / 228; idle hero clock Paint at the top 8 / 17 / 8 (no idle gain; follows the ticks);
  morph tweens 0 clock-paint frames in all arms; m = 1 holds (n = 2 per arm): Layout 102, 102 / 106, 114 / 104, 106,
  RecalculateStyles 179, 179 / 184, 191 / 182, 184, clock-paint frames 26, 27 / 29, 34 / 28, 30 -> 1 of 2 strip-rw
  holds above the A/A range (+8 Layout, +7 RecalcStyle, +4 clock-paint frames), the other inside it; mechanism
  unchecked (OBSERVED)
idle triple (Chrome, 2 rounds, 06-25Z): style writes/s lower at every spot (top 38.6-39.8 vs 58.4-76.4, mid 2-2.8 vs
  6-7.2, end 2-2.2 vs 6.6-11.2); LayoutCount/s higher at every spot (top 5-5.2 vs 2-2.4, mid 2.8-3 vs 1, end 1 vs 0);
  RecalcStyleCount equal; observer callbacks at the top 2.2 vs 1.6 (cause unchecked)
prediction: P-072 drafted (below); registered only after the user's decision on R-fade
debug hooks: none added (st6-rb2's __fwMorphDrive is inherited)
```

```
USER DECISION cd-strip · residual R-fade and a possible pin cost (pixel identity is a user rule; PR-001 was a one-off)
what differs (pixels): under the hero's exit fade at about 50 % (clock opacity 0.55, the page scrolled half a
  viewport), in one rendered frame at a time (8-17 ms) while the seconds-ones digit is mid-roll (170-500 ms after a
  tick), 11-47 device px of that digit's glyph edge are 1 level (of 255) off the faces' (Simulator screenshots).
  At rest, at full opacity, at 18 % opacity and in the panel: 0 differences. Chrome: 0 beyond its own A/A.
how often (Simulator frozen frames, shots with a digit-row difference, pooled over every fade50x session):
  faces vs faces (A/A) 4 of 65 (6 %) | strip-rw 3 of 26 (12 %) | strip-rb 2 of 26 (8 %)
  strip-rw per session: 05-17Z "two changes" frame 14: 13 px, frame 30: 47 px | 05-39Z frame 10: 11 px (the A/A shows
  the same 11 px in two other sessions). Only "two changes, frame 30" never showed in an A/A (0 of 8; strips 3 of 7).
what may cost (counts, no timing): Chrome +1 to +3 layouts per s (the wrapper move, once per roll per changed digit);
  Simulator: 1 of 2 m = 1 holds at the morph pin above the A/A's range (+8 Layout, +7 RecalcStyle, +4 clock-paint
  frames per ~1.4 s), the other inside it; n = 2 per arm; mechanism unchecked (OBSERVED). No frame timing measured
  (deferred); the wave-2 phone run would check "no new slow frames" (P-072).
gains in plain words: the hero clock keeps a third of the graphics memory (0.39 vs 1.18 MB, 16 vs 48 backed layers);
  scrolling back up to the clock repaints it about half as much in the first second (23 vs 54-55 paint records);
  the page writes about half as many inline styles per second while idle. It does not stop the clock repainting
  while it ticks at the top, and no frame-time gain is claimed. It is also the base cd-roll-ca builds on.
options:
| | what happens | gains kept | costs |
| (a) land strip-rw | the strip ships with R-fade and the possible pin cost as described | all of the above | not byte-identical: a delta-1 glyph-edge difference on the rolling seconds digit in single frames while the hero fades out; up to +3 layouts per s (Chrome), possibly more layout at the pin |
| (b) park cd-strip | st6-rb2's faces stay | none | cd-roll-ca needs its own base: drive the 10 faces per digit with Web Animations (about half a day of code), re-run all it has measured (Chrome position probe, hide-check, comp-check, fix.mjs check; Simulator hide, counts and the frame set), restack on st6-rb2, new snapshots. Faces may bring their own class (unmeasured) |
status: OBSERVED (Simulator and Chrome harnesses, our setup), cause unknown; the same pixel class is in the A/A at a
  lower rate
```

```
P-072 (DRAFT, not registered: waits for the user's decision; then registered before any wave-2 or phone data)
V = cd-strip strip-rw on st6-rb2 (JS 5e37af69bcc4, CSS 9b2f89ea58bd) vs C = st6-rb2 (JS 7bf7c4657d21, CSS
  f523598b2a24), snapshot b1789284481295-4ad4a84a; cd-strip's share read where wave 2 isolates it (an arm without
  cd-strip, or the st6-rb2 control); otherwise only the counts below are judged
driver: the wave-2 phone run as the lead runs it (W window run, Timeline on; LayerTree in attribution runs after the
  end sentinel; one scroll away and back to the top in an attribution run for re-entry)
predictions:
  re-entry: clock Paint records in the first 1 s back at the top: C ~54 [35, 75], V ~23 [12, 38]
  backing: hero clock backed layers C 48, V 16 (+-4); hero clock backing C ~1.2 MB, V ~0.4 MB [0.3, 0.6]
  style writes: measured in Chrome (lower at every spot), not predicted for the phone
  layout: Layout records per 4 s at the top V - C in [-10, +15]; per m = 1 hold at the pin V - C in [-6, +14]
  no new slow frames: frames > 50 and > 34 per run at the top and at the pin, V - C in [-1, +1] (+-4 ms twins)
  no idle-redraw claim: hero clock Paint records per 4 s at the top are not predicted to fall (V - C in [-8, +12])
falsified if: re-entry V >= 38 or V >= C; backed layers V > 20; any visible digit change; frames > 50 at the top or
  the pin rise by >= 2 per run in V; Layout at the pin above the band in >= 2 of 3 holds
decisions: hit -> strip-rw stays wave 2's base for cd-roll-ca; re-entry or backing missed -> back to the code (the
  cell layers behave differently on the phone); frames or pin Layout worse -> skip the wrapper write while the clock is
  hidden (re-top on the first visible frame) or drop cd-strip from the wave
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize ·
rubber band (all need a timed or phone run; the pixel harness covers the clock states, not these).

## Next

- The user decides R-fade (USER DECISION card; the lead posts it as a proposal). (a): register P-072 against the
  BUILD card above, before any phone data; send the sha to mgmt-ops-9; land request. (b): park; tell fix-cd-roll-ca.
- Phone: the frame effect is measured only in the wave-2 phone run against P-072 (D was signed on the fast path with
  no gain claim, so no separate phone segment card now).
- P-032 (fix-nav-morph) is re-registered on the strip build after the D card.
- fix-cd-roll-ca stacks on this patch (hero clock only; WAAPI roll driven via the strip's transform).

## Risks, conflicts, follow-ups

- R-fade and the possible pin cost (USER DECISION card): open until the user decides.
- fix-cd-roll-ca relies on this build's shape: `w = r.firstChild` is the wrapper, cells are `w.children`; effect 1
  (deps [c]) writes the cell tops and cd-roll-ca replaces its body; effect 2 writes the wrapper top on c and m; effect
  3 (the strip transform) is unchanged. A change to any of these breaks cd-roll-ca (told).
- The wrapper must stay uncomposited (Sim: 0 layers). If a later rule gives it a layer (will-change, a transform,
  an animation), the cell layers sit under a composited parent with a large offset again, the geometry that showed
  the late-roll delta in strip-cl (OBSERVED, cause unknown).
- Layout: the wrapper's `top` write is a layout move, about once per roll per changed digit (Chrome +1-3 layouts per
  s). The cost per layout was not measured (timing deferred).
- Memory: hero clock backing is lower (0.39 vs 1.18 MB, Sim); page layer count is higher (cells plus strips: 96 hero
  clock layers vs 80), most of them unbacked. Chrome's layer memory was not measured.
- countdown-faces (de-countdown): replaces its part (a). Its part (b) does not stack mechanically: its `patch.diff` is
  against the plain baseline and rewrites the same `$E` body and template, so (b) needs a restack on cd-strip (de-
  countdown told).
- cdwc (fix-nav-morph): the panel rule is retargeted, not removed; the strip CSS sits next to it.
- Reduced motion: unchanged (the spring snaps; the strip jumps by whole cells).
- `.face.svelte-1quva9c` CSS stays in the file, unused.

## Files

`patch.diff` (strip-rw), `../cd-strip--a/patch.diff` (arm a, rejected), `pixels.mjs` (Chrome frozen-frame harness),
`simpx.mjs` (Simulator frozen-frame harness), `sim.mjs` (Simulator counts and the wrapper census), `idle.mjs` (idle
triple, adapted from scene-scope's `idletriple.mjs`; Layout and RecalcStyle counts via CDP `Performance.getMetrics`),
`snap.mjs` (immutable arm copies), `pool.mjs` (pools the Simulator fade50 shot differences by build and region:
the R-fade table), `results.json`.
