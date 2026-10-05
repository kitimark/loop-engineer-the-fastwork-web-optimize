# Fix: end-morph-p1 (PR-012 rev 1, fix-morph-gpu's composited clip reveal, ported onto v9-final)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** measured (Chrome and Simulator gates, counts and pixels only, no timing). Ready for the lead's review.
**Credit:** the change is **fix-morph-gpu's PR-012 rev 1** (`fixes/morph-gpu/delta.diff`), accepted by the user on
2026-10-04 (no notes). The user accepted that look, so this is no new proposal. The port is byte for byte rev 1's
JS block (`__rvMq` … `__rvW`, one `__rvW(e[--morph])` call) and CSS block (`[data-fw-rv]`). Only the two credit
comment lines differ, and `build.mjs` checks that. fix-end-morph found the end-of-page repaints, ported rev 1 onto
v9.2 first, and wrote the gate scripts used here (`em-px2.mjs`, `em-chrome.mjs`, `em-sim.mjs`); their copies here
keep their credit headers.
**Stage:** F (build + gates). The D card is fix-end-morph's (topic end-morph: each morph frame repaints the photo-wall
tracks, header, footer and centre, OBSERVED).
**Device class / gate:** phone render-bound (WebKit paint during the morph); Chrome counts as a second view.
**Driver(s) behind the claims:** frozen frames (scroll-driven 7c stops, touch held), rAF-stepped scroll (counts).
No phone (iPhone disconnected, T-207), no timing (memory defer-timing-focus-call-tree).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (v9-final pretty lines 14587-14590 after `__mkW`, +139
lines; 14718 one call after `__mkW(e[--morph])`), `/_app/immutable/assets/2.gBuqKVzi.css` (+65 lines at the end).

## Builds (`node fixes/end-morph-p1/build.mjs`, strict applier, exact context)

| name | how | JS / CSS sha256/12 |
|---|---|---|
| C = v9-final (7c) | baseline + `fixes/v9-best/patch.diff` | 647c9ef2b1e2 / e1359ab9994a (pinned) |
| V = P1 | C + `delta.diff` (228 lines) | **602aae528fe3 / a81b9af7b2c9** |
| R1 = PR-012 rev 1 (accepted Try-it B) | baseline + `fixes/morph-gpu/patch.diff` | 372b99478871 / 257507365449 (pinned) |
| BB = best-build (rev 1's base) | baseline + `fixes/best-build/patch.diff` | 65052c4a3902 / e0f92804c521 (pinned) |

Checks, all passing: delta's 205 added lines = rev 1's except the 2 credit comment lines; V - delta = C (reverse);
`node --check`; `patch.diff` (baseline-relative, 5380e4a82875) reproduces V. Rev 3's guard is already in C
(CSS 5705: `#platform` `opacity: min(var(--morph-fade), 0.9999)`).

**Stacking with F1+U2 (int-v8's pinned v9-final + F1 + U2, a6426953727a / e1359ab9994a):** no shared lines. F1+U2
edits the 7c engine (C lines ~14190-14315), P1 the header component (14587, 14718) and the CSS end, ~270 lines
apart. C+F12+P1 = C+P1+F12 = 4da641f828bb / a81b9af7b2c9 (strict applier, both orders; `out/em1/stack.mjs`). Read
interaction: U2 runs F() in __msTick's microtask, after Svelte's flush, so F() sees P1's full-size nav as before; U2's
forced re-test after a close also refreshes the probe line P1 moves.

**Read checks against v9-final's other parts:** 7c (`__msTick`, `__navMorphSet`, `__msSettle`) writes no style on the
nav, its bar, logo, actions or panel (only `--fw-ms-h` on #platform and the root's overscroll), so no clash with the
reveal's inline `translate`/`clip-path`. nav-earn rev 3 animates `translate` on the Join button and the language wrap
and `clip-path` on the earn box; the reveal moves the actions box (`ie`) and keeps its `-50%` (as fix-end-morph read it
on v9.2). nav-hit-cache U1 runs F() every frame while the morph is active (`C()`), so the moved probe point is
re-read each frame.

## Gates (Chrome first, then the Simulator; counts and pixels only)

Scorer: `fixes/v9-best/gates/pxlib.mjs` (int-v8), four loads A, V, A2, V2 per run; "consistent" = over 8 levels in all
four cross pairs while neither A/A pair is. Gate script `gates/em-p1-px.mjs` (fix-end-morph's em-px2 + a walk that
never enters the zone, so `pre` (endStart - ih/2) and `up0` (endStart, m 0) are fresh pre-zone renders; `post` = the
pre position after the close; cross-stop pairs). Stops: m 0.02, 0.05, 0.1, 0.19, 0.25, 0.5, 0.8, 0.99, 1, then
0.5, 0.1, 0 down (Simulator: 0.02, 0.1, 0.19, 0.5, 0.99, 1, then 0.5, 0).

**Self-tests (A/A):** Chrome 775 v9-final vs itself: 0 consistent at all 15 stops (`px-chrome-selftest-775-…`).
Simulator v9-final vs itself: 0 consistent at 10 of 11 stops; `post` 70 css px (max 128) under #platform, a per-load
state (A/A over 8 at post 0.9-3 % in every run, also in Chrome; F-293/F-294's load-phase class).

### (a) Outside the morph zone: PASS (0 css px beyond A/A)

| check | Chrome 430x775 | Chrome 430x932 | Simulator |
|---|---|---|---|
| pre (m 0, fresh, endStart - ih/2) | 0 | 0 | 0 |
| up0 (m 0, fresh, endStart) | 0 | 0 | 0 |
| up1 (m 1 at rest) | 0 | 0 consistent (23 AV, button text, A/A class) | 0 |
| P1 dn0 (after a close) vs v9-final's fresh up0 | **0** (max 34, 2 device px) | **0** | **0** |
| P1 post vs v9-final's fresh pre, nav band (top 100 css px) | page under the nav differs in C itself (below) | **0** | page differs in C itself |
| same-stop P1 vs v9-final at post | 357 consistent = C's own label shift (below) | - | 0 |

**v9-final's own post-close shift (its own line, as the lead ruled):** v9-final draws the "Join waitlist" label
1 css px off after a close, like v9.2 (fix-end-morph, OBSERVED, cause unknown, a raster state after nav-earn's close
animations). Measured: C dn0 vs C up0 = **357 css px (775) / 341 (932), max 236**, box [304,16]-[416,64] css (the
label); C post vs C pre in the nav band at 932: 341, the same label. P1 keeps the pre-zone render (0). The Simulator
shows no such shift in C (0).

**Pitfall (F-301):** at the pre position after a close, the page under the nav differs from its pre-zone render in
v9-final itself (775: 26-40k css px, #platform shrink-track content; Simulator 24-32k), so that cross-stop compare
only means something in a nav band or at y = endStart.

### (b) Inside the morph zone: equal to rev 1's accepted render (PR-010 numbers)

Reference: rev 1 vs best-build at the same m, same session, same scorer (fix-morph-gpu's `gates/frames.mjs` on the
rev 1 hook build `rvhook-81a43009c62d` = 372b99478871 + the `__fwMorphSet` hook; `gates/rv1-score.mjs`). The user
accepted rev 1 with this residue (T3 motion: text moved by transforms instead of re-laid out). P1 on v9-final vs
v9-final must show the same residue, within the PR-010 numbers.

Consistent css px² beyond A/A (max level):

| m | P1 ~ C, 775 | rev 1 ~ BB, 775 | Δ | P1 ~ C, 932 | rev 1 ~ BB, 932 | Δ |
|---|---|---|---|---|---|---|
| 0.02 | 826 (63) | 737 (66) | +89 | 949 (203) | 879 (203) | +70 |
| 0.05 | 1001 (109) | 740 (81) | +261 | 891 (194) | 813 (194) | +78 |
| 0.1 | 1014 (92) | 960 (77) | +54 | 973 (181) | 948 (181) | +25 |
| 0.19 | 1029 (110) | 775 (124) | +254 | 884 (151) | 791 (149) | +93 |
| 0.25 | 372 (127) | 254 (46) | +118 | 214 (85) | 126 (61) | +88 |
| 0.5 | 977 (179) | 1197 (157) | -220 | 838 (177) | 855 (175) | -17 |
| 0.8 | 10136 (236) | 10202 (236) | -66 | 9493 (236) | 11643 (236) | -2150 |
| 0.99 | 6362 (236) | 6376 (236) | -14 | 4027 (237) | 5981 (236) | -1954 |
| 1 | 0 | 0 | 0 | 0 | 0 | 0 |

- Chrome: P1's residue is never more than rev 1's by more than **+261 css px (+0.08 % of the frame)**. Where it differs by
  more (932, m 0.8 and 0.99), P1 is *smaller* than rev 1. Max levels stay within rev 1's accepted 237. The largest
  level increase is +81, at m 0.25, 775. Both levels in that pair are edge pixels on the nav bar's text, under the
  T2 edge limit of 128.
- **Simulator** (fw-sim 15 Pro Max, Safari 26.5). P1 ~ C comes from `em-p1-px.mjs --engine sim`. The rev 1 ~ BB
  reference was run in the same session with fix-morph-gpu's `gates/sim-frames.mjs` (M, R, M2) and scored with
  `rv1-score.mjs`. Consistent css px² (max level):

  | m | P1 ~ C | rev 1 ~ BB | Δ |
  |---|---|---|---|
  | 0.02 | 451 (100) | 507 (91) | -56 |
  | 0.1 | 162 (72) | 296 (58) | -134 |
  | 0.19 | 634 (94) | 395 (108) | +239 |
  | 0.5 | 969 (112) | 1112 (131) | -143 |
  | 0.99 | 5262 (237), 1.31 % | 5301 (237), 1.32 % | -39 |
  | 1 | 0 | 0 | 0 |

  Going down, dn0.5 = 970 and dn0 = 0. The largest excess over rev 1 is +239 css px (0.06 %), and the largest level
  excess is +14.
- Within the PR-010 numbers, applied to the gap between the two renders: the area gap is ≤ 0.5 % and ≤ 2,000 css px
  at every stop where P1 is larger. Level gaps stay inside fill 64 / edge 128.
- Not a direct pixel compare. P1-on-v9-final and rev 1-on-best-build sit on different pages: 7c's sticky #platform and
  .fw-ms-end, and nav-earn rev 3. They are also driven differently: 7c by scroll, rev 1 by its `__fwMorphSet` hook.
  So the rule is "the same residue against its own base". The reveal code itself is byte-identical.

### F() nav probe: PASS

At every stop and every load, in Chrome at 775 and 932 and in the Simulator, F()'s hit element and is-on-dark equal
v9-final's. The one exception is `post`, where A2 (the A/A load) differs from A too, so that stop is load-phase noise.
The probe point moves exactly as fix-end-morph found on v9.2:
- while data-fw-rv is on, the probe y is 44;
- in v9-final it is 47.9 → 44.8 over m 0.02 → 0.8.

Script: `gates/state-cmp.mjs`.

### Rev 3's guard (#platform opacity never crosses 1): PASS

- **Computed style at the stops:** #platform's computed opacity is ≥ 1 at 0 of 60 load-stops in Chrome at 775 and at
  932, and at 0 of 44 in the Simulator. At m 0 it is 0.9999.
- **Every frame (counts):** an rAF-sampled stepped open and close, 100 frames per run, run 2 times per arm, touch held
  (`em-chrome.mjs`).
  - Frames at opacity ≥ 1: 0 in both C and P1.
  - Max opacity: 0.9999.
  - 12 frames per run have `--morph-fade` ≥ 1, where the guard is what holds the value under 1.

### Counts: P1 against v9-final

**Simulator** (WebKit, `em-sim.mjs` from fix-end-morph; rAF-stepped, 30 steps per phase, arms C, P1, C2 in one
session; paints / kpx, layouts):

| phase | C | P1 | C2 (A/A) |
|---|---|---|---|
| approach | 201 / 20212, L 103 | 210 / 20254, L 105 | 199 / 20206, L 103 |
| open | 442 / 34583, L 138 | **208 / 13337**, L 138 | 416 / 34055, L 133 |
| rest open | 49 / 761 | 50 / 762 | 35 / 747 |
| close | 399 / 32950, L 137 | **117 / 11974**, L 147 | 385 / 31922, L 132 |
| rest closed | 90 / 2178, L 23 | **49 / 634, L 2** | 87 / 2149, L 23 |

- Open and close repaint about half to a third as much: paints -52 % / -70 %, painted area -61 % / -63 %.
- The C/C2 spread is 26 paints at open and 14 at close.
- The remaining painters are #platform (32 at open, 38 at close; 430x1880, its blur fade) and the morph centre.
- Style recalcs go up by 11-13 at open and by 2-10 at close: the reveal's inline transforms.
- At rest closed, the header's 0.68 s width transition after the close is gone, the same as in Chrome (below).
- fix-end-morph's v9.2 run (S2) shows the same pattern: open 438 → 155 paints, close 387 → 87.

**Chrome** (430x775, 40-step phases, touch held, 2 runs per arm; totals per phase; the two runs of each arm agree
within 1-9):

| phase | C paints / raster / layout | P1 paints / raster / layout |
|---|---|---|
| open | 324 / 581 / 44 | 315 / 270 / 45 |
| close | 320 / 545 / 41 | 320 / 298 / 42 |
| rest closed | 141 / 162 / 38 | 117 / 157 / **0** |
| lift open | 378 / 360 / 20 | 376 / 202 / 21 |
| lift close | 366 / 409 / 62 | 373 / 334 / 24 |

- Chrome paint counts barely move: Chrome paints per paint layer, and the reveal keeps the same layers.
- Raster tasks fall by about half in the open and close phases.
- Paint-event area goes up about 14 %: the full-size nav layer is painted once, at its final size.
- Rest closed layouts go 38 → 0. In v9-final, after the close, the nav's width transitions for 0.68 s from its last
  step's width to the pill (a 0.2 px change). Rev 1's `transition-property` override at m 0 skips that transition,
  so the nav snaps to the pill. dn0 vs the fresh up0 = 0 shows that the result looks the same.

## Risks, conflicts, follow-ups

- **Desktop:** P1 is gated by `matchMedia('(width <= 640px)')` and `@media (width<=640px)`, so it is inert on desktop.
  Rev 1's own desktop 1280 check showed nothing beyond A/A. Not re-run here: on desktop 7c has no `.fw-ms-end`, and
  em-p1-px needs it.
- **Reduced motion: every rest is exact; in real use the reveal never switches on.**
  - Code: with reduced motion v9-final turns 7c off. `__msOn` needs `!e.matches`, at JS 14172. `E()` then sets m
    straight to 0 or 1 (JS 14331-14334, `XM` at 13587), so m never sits in 0.001-1.
  - Chrome run with reduced motion emulated: `px-chrome-p1-775-reduced-2026-10-05T23-25-53-424Z`. 7c is off there, so
    the stops are set with the page's own `window.__navMorphSet(m)` at the page end.
    - Exact (0 beyond A/A): pre, up0, dn0, post, and every cross-stop pair. v9-final shows no label shift here.
    - F() hit and is-on-dark: equal at every stop.
    - #platform opacity is >= 1 at 0 of 60 load-stops.
  - Forced in-between stops, which cannot happen in real use with reduced motion: the residue equals rev 1's reduced
    reference (`frames-2026-10-05T23-23-55-871Z`, rev 1 ~ BB with `--reduced`):

    | m | P1 | rev 1 |
    |---|---|---|
    | 0.5 | 5617 | 5700 |
    | 0.99 | 10114 | 10022 |

  - At m 1 after the forced path, both P1 and rev 1 show 164 css px, max 28 (fill), in the veil's lower-left corner.
    This is rev 1's own state, identical in both, and within T2's fill limit of 64.
- **Phone:** no iPhone in this session (T-207). The open-start cost rev 1 showed on the phone (P-092: first open
  frame +7 ms) was traced to #platform's opacity crossing 1, which rev 3's guard fixes, and that guard is in v9-final.
  P1 has not been on the phone on v9-final. A phone no-worse block would need a card from the lead.
- **Stacking:** P1 stacks with int-v8's v9-final + F1 + U2 with no shared lines (above). The lead decides when.
- Measurement code was not changed. The gate scripts are copies with credit; `em-p1-px.mjs` adds only the walk limit,
  the stops, the cross scores and `--reduced`.
