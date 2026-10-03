# F3 rendering cost card: C aw1-10e vs V mw10e-arm-scope-c vs D mw10e-arm-scope-d

Asked by the lead for user T-035 #8. Layout from arch-isolated-measure: `research/architecture/isolated-measurement/README.md` §6.
Sources are heat-free counts only: Chrome traces and Simulator Timeline. No phone, no timing verdict. ms are recorded in
`costcard.json` and are never judged. Owner: fix-nav-morph. Snapshot b1789284481295-4ad4a84a.

**Plain reading** (all OBSERVED in our setup):
- D removes no per-pin work compared with C, in either engine.
- What D adds: 2 window listeners at the morph start, a doubled morph touch handler call per touchmove (the second returns early), and, in Chrome only, one extra frame with 29 Paints at the arm. Mechanism UNRESOLVED.
- V matches C on every count. Its only difference is coverage: 93.2 % of the viewport has a non-passive touchmove listener mid-tween and at the pin, against 100 % for C and D.

## Builds and setup

**Builds.** Each arm is served from its immutable snapshot copy and hash-checked on every load. A mismatch is VOID; there were 0.

| arm | JS (2.DyWL8TcE.js) | CSS (2.gBuqKVzi.css) | touch listeners |
|---|---|---|---|
| C, C2 (A/A) | 3e2f599a1632 (aw1-10e) | c6aad94b455f | on the window from setup: touchstart passive, touchmove non-passive, wheel |
| V | c6d3590576a7 (F3 arm-scope -c) | c6aad94b455f | on #platform and the nav only, plus the window wheel |
| D | 999c4497f37e (F3 arm-scope -d) | c6aad94b455f | as V, plus window touchstart/touchmove while the morph is active (`__twOn` at the morph start, `__twOff` when it ends) |

**Chrome** (`costcard-chrome.mjs`):
- Headless Chrome, 430x932, DPR 3, mobile with touch, no CPU throttle (counts, not time). Served with --https --latency 150 --vendors=local.
- Every load is cold: a fresh server on a new port, in a fresh isolated browser context.
- 4 loads per arm (C, V, D, C2), over two holds of the shared lane, arm order rotated per rep.
- Per load: scroll to the end, then trace one up-swipe that starts the morph (**start**), 9 pin pushes, and 4 s idle at the pin.
  - The first pin push after the load (the cold first pin) is **push-1**.
  - Pushes 2-9 are **push-n**, median per load.
  - The idle is **hold-frame**: hold counts / BeginMainThreadFrame.
- Events are cut at the probe's own console.timeStamp marks on CrRendererMain.
- Listener adds and removes are logged by a document-start wrapper, also as timeStamps, so they fall in their event.

**Simulator** (`costcard-sim.mjs` + `costcard-sim-read.mjs`; iPhone 15 Pro Max Simulator, WDA strokes `gestures/costcard-pin-v1.json`, `gesture --timeline --inject`):
- One session per rep, each a normal 420 s hold, as ruled for I-086 option (a): rep 1 C V D C2, rep 2 V D C2 (C did not fit the hold), rep 3 C D V.
- Each arm in a session gets a fresh server, so a fresh origin.
- Events are cut per stroke at the logger's touchstarts:
  - **morph-start**: the stroke during which --morph goes 0 → 1;
  - **push-1**: the next stroke, the cold first pin;
  - **push-n**: the rest, median per load;
  - **hold**: 4 s idle.
- Every count but frames, listener ops and touchmoves is printed **per RenderingFrame of its own event window**, because Simulator windows differ in length between loads (settle waits, momentum).
- Simulator comparisons hold within a session only (I-082). With 2-3 sessions, the medians below pool them; the per-session values are in `costcard.json` (`perLoad.sim`).
- The Simulator logger installs after mount, so listener adds at setup are not seen. The Sim coverage cell is "n/a (logger installs after mount)".

## Card rules (§6)

- Value = median over loads, [range].
- tol = max(2·|C − C2|, floor). The floor is 2 counts per event, or 2 / frames for per-frame rows.
- Mark "=" when |Δ| ≤ tol, "↓"/"↑" otherwise. "low-power" when tol > C/2.
- "ctx" rows (frames, paint area, memory) are context and never judged.
- AA covers C's noise only (C vs C2). V and D have no A/A of their own.
- push-1 has one event per load, so its n is the load count (Chrome 4 per arm; Simulator 2-3).
- Paint area is not element-attributed: Chrome's Paint clip is the layer's cull rect (an upper bound; ts-costcard, from chromium paint_layer_painter.cc), and the Simulator's is the clip quad. So it is context only.
  - Chrome start is n/a: about 400 of its ~700 Paints carry an unbounded cull rect (16777215 px a side) or a ~25000 px 3D-face rect, so their sum (~5e16 px²) means nothing.
- Simulator script rows are also split by a per-load mode, `[loop on]` / `[loop off]`:
  - In some loads the scroll engine's rAF scheduler (`rE`, JS 2668) runs every frame at the pin, in the 4 s idle too. Cause unknown, OBSERVED.
  - It adds ~5.5 script records per frame. It occurs in C, C2, V and D alike: on in C r1, V r1, D r1, C2 r1, C2 r2, D r3, V r3; off in V r2, D r2, C r3.
  - So the pooled script rows mix two modes. Read the `[loop on]` rows: n = 1/2/2, with C2 for the A/A. The `[loop off]` rows have one load per arm and no C2, so they are unmarked.

## Card

| # | field | event | engine | source | unit | C | V | D | V−C | D−C | mark (V / D) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | frames (BeginMainThreadFrame) | start | Chrome | FULL | per event | 123 [122-125] | 123 [123-125] | 123 [121-123] | 0 | 0 | ctx / ctx |
| 2 | frames (BeginMainThreadFrame) | push-1 (n 4/4/4) | Chrome | FULL | per event | 59 [56-66] | 57 [56-64] | 56 [56-59] | -2 | -3 | ctx / ctx |
| 3 | frames (BeginMainThreadFrame) | push-n | Chrome | FULL | per event | 58.75 [58-61] | 58 [57.5-63.5] | 58 [57.5-58] | -0.75 | -0.75 | ctx / ctx |
| 4 | listener adds/removes | start | Chrome | FULL | per event | 0 | 0 | 2 | 0 | 2 | = / = low-power |
| 5 | listener adds/removes | push-1 (n 4/4/4) | Chrome | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 6 | listener adds/removes | push-n | Chrome | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 7 | morph touch handler calls (j + M) | start | Chrome | FULL | per event | 13 | 13 | 24 | 0 | 11 | = / ↑ |
| 8 | morph touch handler calls (j + M) | push-1 (n 4/4/4) | Chrome | FULL | per event | 13 | 13 | 26 | 0 | 13 | = / ↑ |
| 9 | morph touch handler calls (j + M) | push-n | Chrome | FULL | per event | 13 | 13 | 26 | 0 | 13 | = / ↑ |
| 10 | touchmove dispatches | start | Chrome | FULL | per event | 12 | 12 | 12 | 0 | 0 | = / = |
| 11 | touchmove dispatches | push-1 (n 4/4/4) | Chrome | FULL | per event | 12 | 12 | 12 | 0 | 0 | = / = |
| 12 | touchmove dispatches | push-n | Chrome | FULL | per event | 12 | 12 | 12 | 0 | 0 | = / = |
| 13 | style recalcs (UpdateLayoutTree) | start | Chrome | FULL | per event | 124 [123-126] | 124 [124-126] | 124 [122-124] | 0 | 0 | = / = |
| 14 | style recalcs (UpdateLayoutTree) | push-1 (n 4/4/4) | Chrome | FULL | per event | 59 [56-66] | 57 [56-64] | 56 [56-59] | -2 | -3 | = / = |
| 15 | style recalcs (UpdateLayoutTree) | push-n | Chrome | FULL | per event | 58.75 [58-61] | 58 [57.5-63.5] | 58 [57.5-58] | -0.75 | -0.75 | = / = |
| 16 | style recalcs (UpdateLayoutTree) | hold-frame | Chrome | FULL | per frame | 1 | 1 | 1 | 0 | 0 | = / = |
| 17 | style elements recalculated | start | Chrome | FULL | per event | 6189.5 [6177-6246] | 6178 [6165-6195] | 6180.5 [6169-6248] | -11.5 | -9 | = / = |
| 18 | style elements recalculated | push-1 (n 4/4/4) | Chrome | FULL | per event | 532.5 [493-581] | 506 [493-565] | 493 [493-540] | -26.5 | -39.5 | = / = |
| 19 | style elements recalculated | push-n | Chrome | FULL | per event | 521.5 [518-542] | 516.5 [508-561] | 518 [508-518] | -5 | -3.5 | = / = |
| 20 | style elements recalculated | hold-frame | Chrome | FULL | per frame | 8.91 [8.88-9.23] | 9.06 [8.88-9.27] | 9.12 [8.88-9.24] | 0.14 | 0.21 | ↑ / ↑ |
| 21 | layouts | start | Chrome | FULL | per event | 45 [44-45] | 44.5 [44-45] | 45 [44-45] | -0.5 | 0 | = / = |
| 22 | layouts | push-1 (n 4/4/4) | Chrome | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 23 | layouts | push-n | Chrome | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 24 | layouts | hold-frame | Chrome | FULL | per frame | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 25 | paints | start | Chrome | FULL | per event | 704 [696-708] | 702 [696-712] | 723.5 [720-735] | -2 | 19.5 | = / ↑ |
| 26 | paints | push-1 (n 4/4/4) | Chrome | FULL | per event | 118 [112-132] | 114 [112-128] | 112 [112-118] | -4 | -6 | = / = |
| 27 | paints | push-n | Chrome | FULL | per event | 117.5 [116-122] | 116 [115-127] | 116 [115-116] | -1.5 | -1.5 | = / = |
| 28 | paints | hold-frame | Chrome | FULL | per frame | 2 | 2 | 2 | 0 | 0 | = / = |
| 29 | page paint area, Mpx² (cull rects: an upper bound, not element-attributed) | start | Chrome | FULL | Mpx² | n/a | n/a | n/a | n/a | n/a |  |
| 30 | page paint area, Mpx² (cull rects: an upper bound, not element-attributed) | push-1 (n 4/4/4) | Chrome | FULL | Mpx² | 207.02 [196.49-231.58] | 200 [196.49-224.56] | 196.49 [196.49-207.02] | -7.02 | -10.53 | ctx / ctx |
| 31 | page paint area, Mpx² (cull rects: an upper bound, not element-attributed) | push-n | Chrome | FULL | Mpx² | 206.14 [203.51-214.04] | 203.51 [201.76-222.81] | 203.51 [201.76-203.51] | -2.63 | -2.63 | ctx / ctx |
| 32 | page paint area, Mpx² (cull rects: an upper bound, not element-attributed) | hold-frame | Chrome | FULL | Mpx² | 3.51 | 3.51 | 3.51 | 0 | 0 | ctx / ctx |
| 33 | script calls (FunctionCall) | start | Chrome | FULL | per event | 298 [296-346] | 298 [297-301] | 309 [309-357] | 0 | 11 | = / ↑ |
| 34 | script calls (FunctionCall) | push-1 (n 4/4/4) | Chrome | FULL | per event | 141 [134-156] | 138.5 [134-142] | 147 [147-168] | -2.5 | 6 | = / = |
| 35 | script calls (FunctionCall) | push-n | Chrome | FULL | per event | 140.5 [136-142] | 137.75 [136-142.5] | 149.75 [149-151.5] | -2.75 | 9.25 | = / ↑ |
| 36 | script calls (FunctionCall) | hold-frame | Chrome | FULL | per frame | 1 [0.97-1.24] | 1.1 [0.97-1.28] | 1.14 [0.97-1.25] | 0.1 | 0.14 | ↑ / ↑ |
| 37 | script calls outside the countdown family | start | Chrome | FULL | per event | 131 | 131 | 142 [142-143] | 0 | 11 | = / ↑ |
| 38 | script calls outside the countdown family | push-1 (n 4/4/4) | Chrome | FULL | per event | 83 | 83 | 96 | 0 | 13 | = / ↑ |
| 39 | script calls outside the countdown family | push-n | Chrome | FULL | per event | 84 [80-84] | 81 [80-84] | 93 [93-94] | -3 | 9 | = / ↑ |
| 40 | script calls outside the countdown family | hold-frame | Chrome | FULL | per frame | 0 [0-0.01] | 0 | 0 | 0 | 0 | = / = low-power |
| 41 | prevented share of pin touchmoves, % | pushes 1..N | Chrome | FULL | % | 100 | 100 | 100 | 0 | 0 | = / = |
| 42 | layers at the pin (LayerTree) | pin | Chrome | FULL | per event | 139.5 [138-141] | 138 | 139.5 [138-141] | -1.5 | 0 | = / = |
| 43 | panel subtree layers | pin | Chrome | FULL | per event | 88 | 88 | 88 | 0 | 0 | = / = |
| 44 | GPU memory estimate, all drawing layers, MB (w×h×4 device px) | pin | Chrome | FULL | MB | 44.53 [44.31-44.75] | 44.31 | 44.53 [44.31-44.75] | -0.22 | 0 | ctx / ctx |
| 45 | GPU memory estimate, panel subtree, MB | pin | Chrome | FULL | MB | 8.09 | 8.09 | 8.09 | 0 | 0 | ctx / ctx |
| 46 | frames (RenderingFrame) | morph-start | Sim | FULL | per event | 254 [222-286] | 202 [150-230] | 211 [163-239] | -52 | -43 | ctx / ctx |
| 47 | frames (RenderingFrame) | push-1 (n 2/3/3) | Sim | FULL | per event | 198 [186-210] | 191 [160-199] | 187 [164-216] | -7 | -11 | ctx / ctx |
| 48 | frames (RenderingFrame) | push-n | Sim | FULL | per event | 149 [144-154] | 148 [146-156] | 151 [143-157.5] | -1 | 2 | ctx / ctx |
| 49 | listener adds/removes (after mount) | morph-start | Sim | FULL | per event | 0 | 0 | 2 | 0 | 2 | = / = low-power |
| 50 | listener adds/removes (after mount) | push-1 (n 2/3/3) | Sim | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 51 | listener adds/removes (after mount) | push-n | Sim | FULL | per event | 0 | 0 | 0 | 0 | 0 | = / = low-power |
| 52 | touchmove dispatches (EventDispatch) | morph-start | Sim | FULL | per event | 38 [36-40] | 80 [80-136] | 80 [80-116] | 42 | 42 | ↑ / ↑ |
| 53 | touchmove dispatches (EventDispatch) | push-1 (n 2/3/3) | Sim | FULL | per event | 76 | 152 [128-152] | 152 | 76 | 76 | ↑ / ↑ |
| 54 | touchmove dispatches (EventDispatch) | push-n | Sim | FULL | per event | 76 | 152 | 152 [150-152] | 76 | 76 | ↑ / ↑ |
| 55 | morph touch handler calls (j + M, JS 13314 + 13317) | morph-start | Sim | FULL | per event | 20 [19-21] | 21 [21-36] | 25 [24-52] | 1 | 5 | = / ↑ |
| 56 | morph touch handler calls (j + M, JS 13314 + 13317) | push-1 (n 2/3/3) | Sim | FULL | per event | 39.5 [39-40] | 39 [32-39] | 78 [78-80] | -0.5 | 38.5 | = / ↑ |
| 57 | morph touch handler calls (j + M, JS 13314 + 13317) | push-n | Sim | FULL | per event | 38.5 [38-39] | 39 [38-39] | 76 [76-78] | 0.5 | 37.5 | = / ↑ |
| 58 | scroll-engine rAF (rE, JS 2668) per frame | morph-start | Sim | FULL | per frame | 0.55 [0.05-1.05] | 1.04 [0-1.06] | 1.05 [0-1.07] | 0.49 | 0.51 | ctx / ctx |
| 59 | scroll-engine rAF (rE, JS 2668) per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 0.55 [0-1.1] | 1.1 [0-1.1] | 1.08 [0-1.11] | 0.55 | 0.53 | ctx / ctx |
| 60 | scroll-engine rAF (rE, JS 2668) per frame | push-n | Sim | FULL | per frame | 0.57 [0-1.14] | 1.13 [0-1.13] | 1.13 [0-1.14] | 0.56 | 0.56 | ctx / ctx |
| 61 | scroll-engine rAF (rE, JS 2668) per frame | hold-frame | Sim | FULL | per frame | 0.5 [0-1] | 1 [0-1] | 1 [0-1] | 0.5 | 0.5 | ctx / ctx |
| 62 | style recalcs (RecalculateStyles) per frame | morph-start | Sim | FULL | per frame | 2.66 [2.63-2.68] | 2.72 [2.58-2.94] | 2.69 [2.65-2.76] | 0.07 | 0.04 | = / = |
| 63 | style recalcs (RecalculateStyles) per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 2.66 [2.63-2.69] | 2.71 [2.63-2.72] | 2.76 [2.57-2.78] | 0.05 | 0.1 | = / = |
| 64 | style recalcs (RecalculateStyles) per frame | push-n | Sim | FULL | per frame | 2.73 [2.7-2.77] | 2.74 [2.69-2.79] | 2.77 [2.69-2.79] | 0.01 | 0.04 | = / = |
| 65 | style recalcs (RecalculateStyles) per frame | hold-frame | Sim | FULL | per frame | 2.42 [2.4-2.43] | 2.46 [2.39-2.47] | 2.44 [2.39-2.46] | 0.05 | 0.02 | = / = |
| 66 | layouts per frame | morph-start | Sim | FULL | per frame | 1.19 [1.17-1.21] | 1.25 [1.13-1.39] | 1.21 [1.16-1.31] | 0.06 | 0.02 | = / = |
| 67 | layouts per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 1.07 [1-1.13] | 1.13 [1.06-1.14] | 1.13 [1.02-1.15] | 0.06 | 0.06 | = / = |
| 68 | layouts per frame | push-n | Sim | FULL | per frame | 1.09 [1.05-1.14] | 1.15 [1.06-1.16] | 1.15 [1.05-1.18] | 0.06 | 0.06 | = / = |
| 69 | layouts per frame | hold-frame | Sim | FULL | per frame | 0.99 [0.96-1.01] | 1 [0.95-1.02] | 1.01 [0.95-1.02] | 0.02 | 0.02 | = / = |
| 70 | paints per frame | morph-start | Sim | FULL | per frame | 6.34 [5.74-6.94] | 7.21 [6.69-7.75] | 6.95 [6.67-7.22] | 0.87 | 0.61 | ↑ / ↑ |
| 71 | paints per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 4.33 [4.29-4.37] | 4.43 [4.38-4.49] | 4.4 [4.25-4.41] | 0.11 | 0.07 | = / = |
| 72 | paints per frame | push-n | Sim | FULL | per frame | 4.47 [4.44-4.5] | 4.46 [4.44-4.6] | 4.49 [4.44-4.49] | -0.01 | 0.02 | = / = |
| 73 | paints per frame | hold-frame | Sim | FULL | per frame | 3.97 [3.93-4.01] | 4.01 [3.88-4.01] | 4 [3.89-4.01] | 0.04 | 0.03 | = / = |
| 74 | composites per frame | morph-start | Sim | FULL | per frame | 1.08 [1.08-1.09] | 1.09 [1.07-1.16] | 1.09 [1.08-1.1] | 0.01 | 0 | ↑ / = |
| 75 | composites per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 1.1 [1.1-1.1] | 1.1 [1.08-1.1] | 1.08 [1.08-1.11] | 0 | -0.02 | = / ↓ |
| 76 | composites per frame | push-n | Sim | FULL | per frame | 1.13 [1.12-1.14] | 1.13 [1.1-1.13] | 1.13 [1.1-1.14] | 0 | 0 | = / = |
| 77 | composites per frame | hold-frame | Sim | FULL | per frame | 1 | 1 [1-1] | 1 | 0 | 0 | = / = |
| 78 | page paint area, Mpx² (clip rects, not element-attributed) per frame | morph-start | Sim | FULL | Mpx² per frame | 0.05 [0.04-0.06] | 0.06 [0.06-0.07] | 0.05 [0.05-0.06] | 0.01 | 0 | ctx / ctx |
| 79 | page paint area, Mpx² (clip rects, not element-attributed) per frame | push-1 (n 2/3/3) | Sim | FULL | Mpx² per frame | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0 | 0 | ctx / ctx |
| 80 | page paint area, Mpx² (clip rects, not element-attributed) per frame | push-n | Sim | FULL | Mpx² per frame | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0 | 0 | ctx / ctx |
| 81 | page paint area, Mpx² (clip rects, not element-attributed) per frame | hold-frame | Sim | FULL | Mpx² per frame | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0.01 [0.01-0.01] | 0 | 0 | ctx / ctx |
| 82 | script records (FunctionCall + rAF + timer) per frame | morph-start | Sim | FULL | per frame | 6.63 [4.19-9.06] | 9.31 [5.57-9.34] | 9.48 [4.98-9.62] | 2.68 | 2.85 | = / = low-power |
| 83 | script records (FunctionCall + rAF + timer) per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 7.78 [5.1-10.45] | 10.31 [5.14-10.48] | 10.26 [5.74-10.87] | 2.54 | 2.48 | = / = low-power |
| 84 | script records (FunctionCall + rAF + timer) per frame | push-n | Sim | FULL | per frame | 8.37 [5.49-11.25] | 11.2 [5.28-11.4] | 11.44 [5.69-11.73] | 2.83 | 3.07 | = / = low-power |
| 85 | script records (FunctionCall + rAF + timer) per frame | hold-frame | Sim | FULL | per frame | 5.43 [2.95-7.91] | 7.94 [3.46-8.19] | 7.93 [2.97-7.94] | 2.51 | 2.5 | = / = low-power |
| 86 | script records (FunctionCall + rAF + timer) per frame [loop on] | morph-start | Sim | FULL | per frame | 9.06 | 9.32 [9.31-9.34] | 9.55 [9.48-9.62] | 0.26 | 0.48 | = / = |
| 87 | script records (FunctionCall + rAF + timer) per frame [loop on] | push-1 (n 1/2/2) | Sim | FULL | per frame | 10.45 | 10.39 [10.31-10.48] | 10.57 [10.26-10.87] | -0.05 | 0.12 | = / = |
| 88 | script records (FunctionCall + rAF + timer) per frame [loop on] | push-n | Sim | FULL | per frame | 11.25 | 11.3 [11.2-11.4] | 11.58 [11.44-11.73] | 0.05 | 0.33 | = / ↑ |
| 89 | script records (FunctionCall + rAF + timer) per frame [loop on] | hold-frame | Sim | FULL | per frame | 7.91 | 8.07 [7.94-8.19] | 7.93 [7.93-7.94] | 0.15 | 0.02 | = / = |
| 90 | script records outside the countdown (rAF/timer at 4039/4142) per frame | morph-start | Sim | FULL | per frame | 6.05 [3.64-8.47] | 8.66 [5-8.77] | 8.75 [4.46-8.94] | 2.61 | 2.7 | = / = low-power |
| 91 | script records outside the countdown (rAF/timer at 4039/4142) per frame | push-1 (n 2/3/3) | Sim | FULL | per frame | 7.19 [4.42-9.95] | 9.81 [4.49-9.96] | 9.75 [5.05-10.3] | 2.62 | 2.56 | = / = low-power |
| 92 | script records outside the countdown (rAF/timer at 4039/4142) per frame | push-n | Sim | FULL | per frame | 7.78 [4.83-10.72] | 10.68 [4.75-10.73] | 10.85 [5.04-11.08] | 2.9 | 3.07 | = / = low-power |
| 93 | script records outside the countdown (rAF/timer at 4039/4142) per frame | hold-frame | Sim | FULL | per frame | 4.97 [2.48-7.46] | 7.47 [2.73-7.6] | 7.47 [2.49-7.47] | 2.5 | 2.5 | = / = low-power |
| 94 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop on] | morph-start | Sim | FULL | per frame | 8.47 | 8.71 [8.66-8.77] | 8.84 [8.75-8.94] | 0.25 | 0.38 | = / = |
| 95 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop on] | push-1 (n 1/2/2) | Sim | FULL | per frame | 9.95 | 9.89 [9.81-9.96] | 10.03 [9.75-10.3] | -0.06 | 0.08 | ↓ / ↑ |
| 96 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop on] | push-n | Sim | FULL | per frame | 10.72 | 10.71 [10.68-10.73] | 10.96 [10.85-11.08] | -0.02 | 0.24 | = / ↑ |
| 97 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop on] | hold-frame | Sim | FULL | per frame | 7.46 | 7.53 [7.47-7.6] | 7.47 [7.47-7.47] | 0.08 | 0.01 | = / = |
| 98 | prevented share of pin touchmoves, % | pushes 1..N | Sim | FULL | % | 100 | 100 | 100 | 0 | 0 | = / = |
| 99 | layers at the pin (LayerTree) | pin | Sim | FULL | per event | 117 | 117 [117-120] | 117 | 0 | 0 | = / = |
| 100 | panel clock face layers | pin | Sim | FULL | per event | 80 | 80 | 80 | 0 | 0 | = / = |
| 101 | layer memory, all layers, MB (WebKit LayerTree) | pin | Sim | FULL | MB | 116.84 | 116.84 | 116.84 | 0 | 0 | ctx / ctx |
| 102 | layer memory, panel subtree, MB | pin | Sim | FULL | MB | 37.45 | 37.45 | 37.45 | 0 | 0 | ctx / ctx |
| 103 | script records (FunctionCall + rAF + timer) per frame [loop off] | morph-start | Sim | FULL | per frame | 4.19 | 5.57 | 4.98 | 1.38 | 0.79 |  |
| 104 | script records (FunctionCall + rAF + timer) per frame [loop off] | push-1 (n 1/1/1) | Sim | FULL | per frame | 5.1 | 5.14 | 5.74 | 0.04 | 0.63 |  |
| 105 | script records (FunctionCall + rAF + timer) per frame [loop off] | push-n | Sim | FULL | per frame | 5.49 | 5.28 | 5.69 | -0.21 | 0.19 |  |
| 106 | script records (FunctionCall + rAF + timer) per frame [loop off] | hold-frame | Sim | FULL | per frame | 2.95 | 3.46 | 2.97 | 0.51 | 0.02 |  |
| 107 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop off] | morph-start | Sim | FULL | per frame | 3.64 | 5 | 4.46 | 1.36 | 0.82 |  |
| 108 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop off] | push-1 (n 1/1/1) | Sim | FULL | per frame | 4.42 | 4.49 | 5.05 | 0.06 | 0.62 |  |
| 109 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop off] | push-n | Sim | FULL | per frame | 4.83 | 4.75 | 5.04 | -0.08 | 0.21 |  |
| 110 | script records outside the countdown (rAF/timer at 4039/4142) per frame [loop off] | hold-frame | Sim | FULL | per frame | 2.48 | 2.73 | 2.49 | 0.25 | 0.01 |  |

loads per arm: Chrome C 4, V 4, D 4, C2 4; Sim C 2, V 3, D 3, C2 2; void/error 1 [{"engine":"sim","build":"C","rep":2,"why":"gesture: this gesture run needs about 69 s, but your chrome-measure hold leaves 58 s before the Simulator must shut down: run it in a new hold (--max-seconds 420)"}]
Sim scroll-engine loop (rE, JS 2668, every frame at the pin) per load: C r1 on, V r1 on, D r1 on, C2 r1 on, V r2 off, D r2 off, C2 r2 on, C r3 off, D r3 on, V r3 on
coverage (Chrome, % of a 10 px viewport grid whose hit path has a non-passive touchmove listener): C pre-morph 100 / mid-tween 100 / pin 100; V pre-morph 100 / mid-tween 93.2 / pin 93.2; D pre-morph 100 / mid-tween 100 / pin 100; Sim: n/a (logger installs after mount)

## Reading the marks

**Chrome** (4 cold loads per arm, 0 void):
- **Listener ops at start, 0 → 2 (D):** the `__twOn` adds of window touchstart (passive) and touchmove (non-passive, capture). The row is "low-power" because C has 0. There are no removes while pinned.
- **Morph touch handler calls (j + M), 13 → 24-26 per event (D ↑):** each touchmove enters M twice in D; the `__fwMorphSeen` guard returns the second call early. Touchmove dispatches stay at 12 per push in all arms.
- **Paints at start, 704 → 723.5 (D ↑):**
  - Every D load has one extra frame with 29 Paints. It is the frame where the window touchmove listener is added (`fwcc add touchmove window`); no C, C2 or V load has it.
  - Paints per push, per hold frame, style, layout and layers are all equal.
- **Script calls outside the countdown, +11 at start, +13 on push-1, +9 per push-n (D ↑):** the duplicate M entries. Total script calls on push-1 stay inside the noise (=).
- **Hold-frame ↑ on style elements (+0.14/+0.21) and script calls (+0.10/+0.14), V and D:** these follow the countdown spring's phase (JS 4039), not the arm. Their tolerance is 2/240 per frame. Treat them as noise; there is no hold work in the touch code.
- **push-1 (cold first pin) = push-n:** the first pin push after a cold load costs the same as later pushes in every arm, in Chrome and the Simulator.

**Simulator** (C 2, V 3, D 3, C2 2 loads; three sessions, I-082: per-session values in `costcard.json`):
- **Morph touch handler calls, 38.5 → 76 per push (D ↑):** the same doubling as Chrome. JS 13317 runs 2× per touchmove in D and 1× in C, C2 and V.
- **Listener ops at morph-start 0 → 2 (D):** as in Chrome.
- **No extra repaint frame in D:** D's arm add lands inside the first frame of the morph tween. That frame already repaints ~96-100 layers in every arm, so a repaint at the add would be hidden.
- **Script records per frame `[loop on]`, push-n +0.24 to +0.33 (D ↑):** the duplicate M calls (+38 calls over ~150 frames per push).
- **Touchmove EventDispatch records, 76 → 152 per push (V and D ↑):** this is a recording difference, not more touchmoves. The logger sees 38 touchmoves per push in every arm, and V's handler calls equal C's. V and D record one dispatch at the element listener plus one at the window; C has only the window listener. OBSERVED, mechanism unknown.
- **Paints per frame at morph-start ↑ (V +0.87, D +0.61):** a window-length artifact. Total paints per morph-start event overlap across arms (C 1540-1642, C2 1335-1352, V 1162-1539, D 1177-1594). Shorter windows (momentum differs) divide the same tween over fewer frames.
- **Layers, faces and layer memory:** equal, 117 / 80 / 116.8 MB.
- **Prevented share:** 100 % in every arm.

## Mechanism of the 29-Paint frame: UNRESOLVED

- Candidate: adding a non-passive touchmove listener on the window changes the page's blocking touch hit-test region. In Chromium that region is painted as HitTestData (touch-action rects, `third_party/blink/renderer/platform/graphics/paint/hit_test_data.h`), which would repaint the layers that carry it.
- The invalidation path from a listener add to those Paints is not cited, so this stays a hypothesis.
- Decisive local check: a D variant whose arm-time window touchmove add is `{passive: true}`. If the 29-Paint frame goes away, the repaint comes from the blocking region.
- WebKit: no reference was checked. The Simulator cannot separate a repaint from the tween's own paints at that frame.

## F3 recommendation (fix-nav-morph)

- **The card gives no evidence for option (b).** D does not remove per-pin work compared with C; it adds some: 2 listener ops per morph, a doubled handler entry per touchmove, and one 29-layer repaint at the arm in Chrome. Coverage at the pin returns to 100 %, so D also gives back V's scope reduction while the morph is active.
- **D's cold-load collapse in P-073 is not explained by per-pin counts.** push-1 equals push-n in every arm on both engines. The one D-only cost lands at the arm (start), not on the pin pushes.
- **V is count-neutral** against C. Its case rests only on the reduced non-passive coverage (93.2 %), which is a phone and finger question; this card cannot answer it.
- **Proposed next step** (lead's call):
  1. If D is kept alive, build D′: register M once (no duplicate entry), and run the passive-add check above. Re-run the Chrome half only.
  2. Any phone block for F3 comes after that, pre-registered: cold first loads counted, one start method, settle bin recorded and not conditioned on, starting warm (38-40 °C).
  3. F3 is a top-3 smoothness fix, so landing still needs the phone check plus the user's finger test (less-work-landing-rule does not apply: D does not do less work).
