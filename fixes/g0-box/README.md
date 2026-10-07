# Fix: g0-box (gpu-original M3-B: the nav box as a clip over a card laid out once)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured, **stopped at gate 1 a third time (v3-W, 2026-10-08)**.
- v3-W = v3 in WebKit only. Chrome is T0 against g0.0c, as designed.
- The full Simulator seek (144 stops, 20 ms steps, four loads) shows that **v3 is not within T2 in WebKit either.**
  The fills are within T2 (flat max 31 ≤ 64). But the nav's outline anti-aliasing reaches **218 levels**, against
  T2's edge limit of 128, at 4 of 144 stops: open@240, 260, 340 and 440, and rev2@0/60. Two more stops sit at
  exactly 128.
- The earlier "Simulator within T2, max 117" (e3857c4f) came from a 10-step seek (20 stops). Re-scored with the same
  tool, those 20 stops give the same numbers again (max 117 at open@420); the denser seek finds the worse stops in
  between. **That 117 claim was under-sampled, and I withdraw it.**
- Reduce Motion showed a real v3-W bug: the colour fade on a reduced-motion close. It is fixed in this patch. One
  stop still misses T2 (close@40: the EN switch's blurred backdrop is lighter mid-fade, flat max 70, 0.61 %); see
  "v3-W" below.
- Per the standing rule ("if v3 misses T2 as well, stop and report"), I stopped before gates 2-3, memory and the
  phone card. Nothing is posted.

**Stage:** F (build), step M3-B of `research/gpu-original/README.md`, on g0.0c (the best build since PR-035).

**Base:** g0.0c = g0.0b + `fixes/platform-corners-g00b/patch.diff` (main fbf96d8c, BEST_BUILDS e1291f8d), built in
`out/g0box/g00c`: JS 5c39f7a96e41, CSS c65da97ba01f. Baseline snapshot b1789284481295-4ad4a84a.

**patch.diff = v3-W**, relative to g0.0c (`a/` = g0.0c's files), made with `diff -u`; it applies cleanly to a fresh
g0.0c copy. Served v3-W: JS 7f7d83162ef6, CSS 2c9deee5b885 (with the reduced-motion fix; 70df8114a809 before it).
- v3 (both engines) relative to g0.0 is in this branch's history (e3857c4f); v2 is in 7da9b47e.

**Files touched (v3-W):**
- `/_app/immutable/nodes/2.DyWL8TcE.js`: the nav component near `__mkW` (pretty lines 14586-14606), +19 lines.
  When `'GestureEvent' in window` (WebKit only; MDN browser-compat-data `api/GestureEvent.json`; the same test as
  heCss and K6), it adds `html.fw-bx`, creates the two fills, and adds the dark fill to `__mkW`'s `--morph` targets.
- `/_app/immutable/assets/2.gBuqKVzi.css`: one block after line 12331, before the platform-corners rule, all under
  `html.fw-bx` and `(width<=640px)`.
- Elsewhere (Chrome, Firefox, widths over 640 px) nothing is created and no rule applies.

## v3-W (lead's decision after e3857c4f): v3 in WebKit only, on g0.0c

All runs were Simulator or Chrome seeks in the shared lane (`fixes/g0-box/gates/run4.sh`: one `--shared` hold per
arm, four loads A V A2 V2, A = g0.0c, V = the overlay). New scorer: `fixes/g0-box/gates/t2.mjs`. It applies the PR-010
consistent rule (over 8 levels in all four cross pairs, while neither A/A pair is over 8 there) and leaves out the
Simulator's status bar (rows above 56 CSS px). It splits each consistent pixel into **edge** (the 3x3 luma range around
it is over 16 levels in A or in V) or **flat** (everything else), and reports both maxima, the area and the biggest
cluster against T2 (flat ≤ 64, edge ≤ 128, ≤ 0.5 %, cluster ≤ 2000 CSS px²).

| gate | build | stops | result |
|---|---|---|---|
| Chrome 430x775, full seek (open, close, rev1, rev2; 0-700 ms by 20) | v3-W before the RM fix | 148 | **T0 within A/A**: state equal at every stop; consistent pixels at 3 stops only, max 8 CSS px², level 53 (A/A max 59), in the countdown/cycler area (x 224-320, y 480-592), not the nav. The RM fix is CSS under `html.fw-bx`, so Chrome is unaffected. |
| Simulator (fw-sim), full seek | v3-W before the RM fix (the fix changes nothing outside a reduced-motion close; see below) | 144 | **FAILS T2 on the edge level.** Flat max 31 (≤ 64, everywhere). Edge max 218 at open@440; failing stops: open@240 (164), open@260 (161), open@340 (182), open@440 (218), rev2@0 (217), rev2@60 (164). Area ≤ 0.18 %, biggest cluster 678 CSS px² (both within T2). State equal everywhere. |
| Simulator, Reduce Motion on (open/close, 10 steps) | before the fix | 20 | **FAIL, real bug:** close@0 and close@100: the nav shows the light fill while g0.0c is still dark (16133 CSS px², max 219). |
| Simulator, Reduce Motion on (open/close, 0-360 by 40, 500, 700) | with the fix | 24 | **Fixed except one stop.** close@0: 58 CSS px², max 48 (was 16133 / 219); close@80 and later ≤ 19 px², max ≤ 28; opens ≤ 20 px² (the box corner, max 69). Still **FAIL at close@40**: 2310 CSS px² (0.61 %), flat max 70, all on the EN language switch (x 208-304, y 80-128). In V it is lighter than in g0.0c in the middle of the colour fade, while the nav fill around it matches (crop `out/g0box/rm40.png`; A/A crop `rm40aa.png` is black). The switch has its own `backdrop-filter: blur(12px)` over a translucent background (CSS 11490-11521), so it samples the nav's colour. In V that colour is the dark fill's opacity transition, not the painted background. Cause OBSERVED in our setup, unknown. |
| iPad width (over 640 px; v3-W does not apply) | — | — | not finished: the iPad session timed out at the 300 s hold cap during boot; not re-run after the stop |

**The edge difference.** It is the same thing that failed Chrome for v3: a 1-device-pixel line along the nav's
rounded corners and side edges, where the dark box meets the light page (crops: `out/g0box/o440c.png` A | V | diff;
the A/A crop `o440aa.png` is black). WebKit anti-aliases the `clip-path: inset(round)` mask differently from v0's
border-radius background plus rounded overflow clip, while the box is mid-tween at fractional device positions
(OBSERVED in our setup, cause unknown). Between the 10-step stops the Simulator's difference is up to 218. It is
deterministic: the 20 stops shared with e3857c4f's run give identical numbers.

**The Reduce Motion bug and its fix.** Under reduced motion the close snaps `--morph` to 0 while the nav is not
`.is-morphing`. v0's nav then runs its background transition (`:not(.is-morphing)`: 0.32 s
`cubic-bezier(0.16, 1, 0.3, 1)` under reduced motion, CSS 12061-12068; 0.7 s otherwise, 11735-11742; 0.7 s for the
ready hero pill at 601-640 px, 11777-11784), so the colour fades dark to light. v3-W's dark fill followed `--morph`
at once. The fix gives the dark fill's opacity the same transition (duration, easing, conditions). Fill opacity over
the constant light fill is a premultiplied crossfade; whether WebKit interpolates the `color-mix` background
transition in the same space is not checked in source (UNRESOLVED; the RM seek above is the decisive local check).

**Not run, because of the stop rule:** gates 2-3 on g0.0c (paints per open and close, the nav root repaint,
layers per open, memory top/mid/end, top-scroll counts), the iPad width, and the phone card. The gain against g0.0c
is therefore not measured. The v2 counts below remain the only counts on this line, and v2 also changed the card.

**Phone kit, drafted before the stop, not signed and not run:** `fixes/g0-box/phone/` (copies of the P-163 kit:
`g0b-serve.sh`, `g0b-hold.sh`, `g0b-block.sh`, `g0b-run.sh`), with the P-161/P-163 lessons (tool-serious via
`iphone.mjs rearm`, Safari parked before the rearm, `thermal.mjs clear` after the hold, the get-ready step on
preflight AUTH, `--block`). It also has `g0b-read.mjs`: p161-read's decision code, with opens taken from touch rows,
because g0 opens are a time tween on a held page and never a scroll crossing (selftest 7 checks ok). It is pinned to
C = g0.0c (5c39f7a96e41 / c65da97ba01f) and V = the pre-fix v3-W CSS 70df8114a809 (snapshot `out/g0box/snap1`, HASHES
57f89d8efa17; dry run: 3 of 3 servers ok, H1-H4/H11 DRY ok, programs ok). Before any use, re-snap with the current
V CSS and confirm that the reader finds touch rows in a real G record.

### Options for the lead (none taken)

- (a) Take v3-W to the user as a look-alike proposal: a 1-device-pixel outline difference on the box's rounded
  corners mid-tween only. Rests and fills are within T2, and Chrome is unchanged.
- (b) Keep `border-radius` on the nav with no background and no clip-path (fills only, `border-radius: inherit`).
  The outline would be v0's mechanism. But WebKit counts a border-radius as a box decoration
  (`RenderLayerBacking.cpp` 3440-3447, 3657-3686), so the nav keeps a backing store that repaints when the radius
  changes. Not measured.
- (c) Drop M3-B, and keep g0.0c's nav.

## v3 (lead's option 3, e3857c4f): fills + clip only, v0's card untouched

**Correction (2026-10-08):** the "Simulator passes" below rests on a 10-step seek. The 144-stop seek in "v3-W" finds
edge levels up to 218 in WebKit too.

v3 keeps v0's box and card exactly as they are. It only removes the nav's own paint:
- the background becomes two composited solid fills (light `#ffffff1a`, dark `#131922` at opacity m);
- `border-radius` becomes `clip-path: inset(0 round 32-12m px)`.

Gate 1 used the same seek against g0.0, four loads per engine (`out/g0box/seek-v3-{c775,sim}.score`; v3 run on
2026-10-08, before the g0.0b rebase).

| engine | worst consistent beyond A/A | max level of that cluster | where | T2 wide limit |
|---|---|---|---|---|
| Chrome 430x775 | 866 CSS px² (0.26 %), open@420 | 226 (open@300-420) | the nav's outline only: left, right and bottom edges and the round corners | edge ≤ 128: **fails** |
| Simulator | 553 CSS px² (0.14 %), open@420 | 117 | the nav's right/left edge and corners | **passes** on edge level, area and per-element size; the 2-3 % flat pixels' own max is not split out (≤ 117) |

- **Simulator status bar:** one 18 px² cluster of max 255 at x 80-112, y 16-48 (shot coordinates) appears at every
  stop, rests included. It sits in the Simulator's status bar above the page, as in g0-gpu's "T0 below the status
  bar", and is not counted.
- **The card in v3:**
  - Chrome: the interior is identical.
  - Simulator: the clusters are the outline too. At open@100 the 388 px² cluster (max 81) is the outline of the
    still-small box, 0-416 x 64-416. The flat share is 0.02-0.03 at open@100, open@420 and close@100, so 97-98 % of
    the differing pixels are edge pixels.
  - Unlike v2, there are no text or digit phase differences.
- **State:** equal at every stop in both engines (morph, classes, aria, focus, hit targets, geometry). There are no
  backdrop/column differences, since the card is v0's.
- **Rests:** Chrome ≤ 38 px² (open and close rest, max 113 at the bottom-left corner). Simulator ≤ 38 px² below the
  status bar.
- **Reading** (OBSERVED in our setup, cause unknown): Chrome anti-aliases a `clip-path: inset(round)` edge
  differently from v0's border-radius background plus its rounded clip of the card, while the box sits at fractional
  device positions mid-tween. The difference is a 1 device px outline, up to 226 levels where the dark card meets
  the light page. WebKit's edges stay within 117.
- **Not run, because of the stop rule:** Chrome 430x815, widths 768/1280, reduced motion, and gates 2-3 for v3.
  The v2 counts below show what the fills and the clip alone save only in part: v2 also changed the card.

### v3's options (e3857c4f; the lead took (a), which became v3-W)

- (a) **Scope the clip to WebKit**, where v3 is within T2, and let Chrome keep v0's border-radius. Chrome would then
  be T0 by construction and lose its share of the gain. This needs an engine test in CSS or JS, which this study has
  not used so far.
- (b) **Keep `border-radius` on the nav with no background** (fills only, no clip). The outline would be v0's in
  both engines. But in WebKit a border-radius counts as a box decoration (`RenderLayerBacking.cpp` 3440-3447,
  3657-3686), so the nav keeps a backing store that repaints when the radius changes. I have not measured how much
  of the saving that keeps.
- (c) Take v3 to the user as a look-alike proposal: a 1 px outline difference mid-tween in Chrome.

The v2 sections below are unchanged from 7da9b47e.
**Driver(s):** Chrome seek harness (frozen clock), Simulator seek, Simulator Timeline and LayerTree census. No
timing A/B and no phone, by design.

## What it does

On g0.0 every tween frame changes the nav's (`header.start-selling-top-nav`) width, height, top, radius,
background and backdrop blur. As a result the nav's own 406x791 layer repaints each frame, and the card inside it is
re-laid out at the box size. M3-B keeps v0's box formulas but stops the box from painting:

- **Colour:** two composited solid fills in place of the nav's background. They are light `#ffffff1a` and dark
  `#131922` at `opacity: var(--morph)`. Source-over of the two equals v0's premultiplied
  `color-mix(#ffffff1a (1-m), #131922 m)`. Both have 0 MB backing (solid-colour layers).
- **Corner:** `clip-path: inset(0 round calc(32px - 12px*m))` in place of `border-radius`. This is a shape mask on
  the composited layer (WebKit `RenderLayerBacking.cpp` 2041-2078, 3238-3284), so a radius change repaints nothing.
  When the locale menu is open, the nav keeps `border-radius` and gets no clip.
- **Card** (`.start-selling-morph-panel`): laid out once at the open size (`--panel-w` x `--panel-h`).
  - Its origin is v0's box origin; the clip cuts what overhangs.
  - The backdrop columns keep their width. The backdrop is centred by a transform, and the columns get
    `will-change: transform`.
  - The veil is drawn at a quarter of the open size and scaled onto v0's box (JS `--fw-bx-sx/sy`). That backing is
    0.75 MB; a full-size veil would be 11.6 MB.
  - The zoom origin is v0's box centre.
  - The centre block and the footer still follow v0's box by layout.
- **Built once:** the fills at component setup and the card's parts at its idle mount. Nothing is created or
  resized when the menu opens.

**The box's per-frame layout stays. Only its paints go.** The lead accepted this deviation from the design: keeping
the backdrop exact matters more than removing the box layout. The nav's width, height and top still change every
frame, and the bar, centre block and footer are still laid out every frame. So the gain claim is **"no box
repaint"**, not "no layout". Gate 2 confirms this: Simulator layouts per open are equal (V 120, A 109; close 143 vs
144).

The structure is permanent from page load (two fills, the clip mask and the full-size card), so I measured the
census, memory and a top-of-page scroll as well (lead's added gates).

### v1 and v2

- **v1** held the card at the page position (12, 12), the open nav's corner, with each part's left and top
  following the box. Geometry matched v0 to 0.05 CSS px, but Chrome put the text 1-2 device px off mid-tween. The
  offset tracked `round(frac(navX) * 3)` device px, for example `open@360` navX 12.42 gives dx 1 and `close@100`
  gives dx -2 (`out/g0box/shiftscan.mjs`). WebKit drew some glyphs with another sub-pixel phase.
  - My reading (OBSERVED, cause not confirmed from source): the parts sit at another sub-pixel offset inside their
    composited layer than in v0, so both engines raster text with another phase.
- **v2** (this patch) puts the card's origin back at v0's box origin. Every part then has v0's offset from the
  card's layer. Chrome improved at some stops but not enough, and WebKit did not change.

## Gate 1: seek parity with g0.0 — FAILS T2

Seek harness `fixes/g0-box/gates/seek.mjs`: a frozen-clock copy of fix-g0-gpu's, plus `rad`, `geo`, `focus` and
`hit` in the state. It was run through `run4.sh` with four loads per engine (A, V, A2, V2), so every V difference is
scored beyond the A/A pair. Scenes were open and close at steps 0, 100, 200, 300, 360, 420, 500, 580, 640 and
700 ms. Outputs are `out/g0box/seek-v2o-{c775,sim}.score`.

| engine | worst stop | consistent beyond A/A | max level | T2 wide limit |
|---|---|---|---|---|
| Chrome 430x775 | open@200 | 3251 CSS px² (0.98 %) | 177 | 0.5 %, 2000 px², fill 64 / edge 128 |
| Chrome 430x775 | close@100 | 3087 CSS px² (0.93 %) | 159 | |
| Chrome 430x775 | open@300 / 360 / 420 | 2078 / 2127 / 1024 px² | 226 | |
| Simulator | open@360 | 2305 CSS px² (0.69 %) | 116 | |
| Simulator | open@580 / 640 | 1064 / 983 px² | 226 / 225 | |
| Simulator | close@200-700 | ≤ 33 px² | ≤ 35 | |

- **Rests** (open@700, close@700, close@0): Chrome ≤ 60 px², max 113 at open rest. The Simulator open rest is
  956 px², max 84.
- **What differs:**
  - Chrome: text, digit and button edges across the whole card, at low level inside the blurred phase. There is
    also a line along the nav's right edge while blurred (the wider backdrop is sampled by the 12 px blur).
  - Simulator: single glyphs (`s`, `ho`, `S`, `d`, `u`, `c`) with another anti-aliasing phase, up to 226 levels,
    plus the card's left and right edges.
  - All of these are sub-pixel phase differences, not layout: `geo` rects of the centre, title, footer, bar, logo,
    actions and veil match to 0.05 px. They are still far over the edge limit (128) and the area limit (0.5 %).
- **State:** morph, classes, aria, focus and hit targets are equal at every stop. The only state differences are
  the backdrop and column rects, whose fixed width is by design. The radius is compared through `rad` and the
  pixels.
- **A/A (Chrome):** 0 at most stops, at worst 20 levels. Simulator A/A max is 255 in the status bar and the
  #platform cycler (F-336); the score masks those pixels.
- **Not run, because of the stop rule:** Chrome 430x815, widths 768 and 1280 (M3-B has no CSS above 640 px, so they
  should be unchanged), and gate 4, prefers-reduced-motion.

## Gate 2: work per tween and layers per open (Simulator, counts only)

`fixes/g0-box/gates/counts-sim.mjs`, one load per arm at the page end, real time. Simulator ms are only a rank
(F-084). Output: `out/g0box/counts/counts-sim-2026-10-07T18-30-21-146Z.json`.

| segment | g0.0 style / layout / paint (Mpx) | M3-B v2 style / layout / paint (Mpx) |
|---|---|---|
| open (900 ms) | 159 / 109 / 928 (78.9) | 189 / 120 / 767 (42.1) |
| close (900 ms) | 192 / 144 / 1048 (53.7) | 194 / 143 / 798 (39.7) |
| rest after open | 101 / 101 / 134 (2.3) | 97 / 97 / 130 (2.2) |
| rest after close | 102 / 84 / 243 (3.8) | 98 / 83 / 152 (2.0) |

- **Paints:** -17 % calls and -47 % area on open; -24 % and -26 % on close.
  - The nav root's 406x791 repaint (29 per open in g0.0) is gone.
  - The bar (398-406 x 52) still repaints, as in g0.0: open 49 vs 34, close 31 vs 62.
  - The tracks (131-139 x 492-512) no longer make the top of V's open list. They still repaint in the first frames
    and in rests, as in A.
  - v1 had A 50.0 / V 42.4 Mpx open. Real-time runs vary, so only the direction is a result.
- **Layouts and styles** are not fewer, as stated above.
- **First frames:** no work moved into frame 1 of an open or close (both arms: frame 1 is empty).
- **Layers built per open/close: 0 in M3-B.** The census at rest, mid-open, open, mid-close and closed, three
  cycles, finds only the Join button's own animation layer (79x37, 0.21 MB). g0.0 shows the same layer, and the
  language-switch wrap (0 MB) appears in one cycle of each arm.

## Gate 3: memory and layers at rest, top / mid / end (lead's added gate)

`fixes/g0-box/gates/top-sim.mjs`, Simulator, one load per arm. Output:
`out/g0box/counts/top-sim-2026-10-07T18-31-42-603Z.json`.

| place | g0.0 layers / MB | M3-B v2 layers / MB |
|---|---|---|
| top (y 0, after the idle mount) | 163 / 52.4 | 161 / 52.0 |
| mid (y 3018) | 53 / 101.1 | 55 / 100.5 |
| end, closed (y 5260) | 54 / 93.1 | 56 / 92.5 |
| end, open (counts-sim) | 54 / 109.3-111.0 | 56 / 86.9-88.6 |

- The two extra layers are the fills, each 0.00 MB. The nav root layer drops from 0.75 MB to 0.00 MB.
- v1, with a full-size veil, was +10.4 MB at every place (veil 11.57 MB). The quarter-size veil removes that.

**Top-of-page scroll** (110 rAF steps of 24 px):

| arm | frames | style | layout | paints (Mpx) |
|---|---|---|---|---|
| g0.0 | 54 | 77 | 201 | 401 (28.3) |
| M3-B | 57 | 80 | 204 | 372 (26.3) |

- g0.0 repaints a 398x52 rect (the nav) 54 times; it is not among M3-B's top six rects.
- M3-B's top rects include 22 paints of 430x775, which g0.0's top list does not show. With one load each I can't
  attribute them. The totals are not higher.
- At rest before the scroll, M3-B logged 25 frames and 21 layouts against 10 and 2. That is one real-time load (a
  43x49 hero animation in both arms) and is not judged.
- So the permanent fills and mask add no measurable work far from the end; the evidence is single loads.

## Notes

- **Measurement code:** I changed no tool. The gate scripts in `fixes/g0-box/gates/` are copies of fix-g0-gpu's,
  plus `avscan.mjs` (a two-arm scan, diagnostic only), `top-sim.mjs` and `t2.mjs` (the T2 report with the flat and
  edge maxima split; no browser). Everything ran in the shared lane
  (`--shared --weight probe|simulator`), one hold per arm.
- **v1 run:** the v1 Chrome four-load run (`out/g0box/seek-v1-c775`) is invalid as a gate. I edited the overlay
  while it ran, so V2 saw another build. It is cited only for the v1 shift diagnosis.
- **WebKit references** (read in `out/engines/WebKit`):
  - CONFIRMED: clip-path makes a shape-mask layer and a backdrop root (`RenderLayer.cpp` 663-684, line 678).
  - CONFIRMED: a composited layer repaints when its device-pixel sub-pixel offset changes (`RenderLayerBacking.cpp`
    1474-1479, 1938-1939). This is why the backdrop is centred by a transform, not by layout.
  - The Chrome text shift and the WebKit glyph phase are OBSERVED in our setup; cause unknown.
- **Possible next steps** (not taken, per the stop rule; the lead decides):
  - (a) Accept M3-B's look as a T3 proposal. The differences are sub-pixel text phase mid-tween only; layout is the
    same.
  - (b) Snap v0's box to device pixels in both A and V. That is a v0 change and would need its own parity question.
  - (c) Keep v0's card at the box size, which brings back the column relayout and repaint, and take only the nav
    fills and clip. That would be M3-A-like, with no change to the card.
