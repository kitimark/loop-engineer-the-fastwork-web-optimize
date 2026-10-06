# Fix: end-morph-p1 (PR-012 rev 1, fix-morph-gpu's composited clip reveal, ported onto v9-final)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** measured (Chrome and Simulator gates, counts and pixels only, no timing). Review NEEDS-WORK addressed
(2026-10-06). The decisive exact-m check puts P1-only pixels over T2's levels at most stops (gate (b) below), so under
the lead's ruling P1 on v9-final is NOT the look the user accepted. It goes to the user as **PR-012 rev 2** with a
Try-it, and lands only after that decision and phone card P-153 (rev 1.2, below).
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
edits C lines 14190-14482 (four hunks: the 7c engine and the F() call; corrected after review, rev 1 of this README
said ~14190-14315), P1 the header component (14587, 14716) and the CSS end; the nearest hunks are ~105 lines apart. C+F12+P1 = C+P1+F12 = 4da641f828bb / a81b9af7b2c9 (strict applier, both orders; `out/em1/stack.mjs`). Read
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

**Self-tests (A/A):** Chrome 775 v9-final vs itself: 0 consistent at 14 of 15 stops; `post` 18 css px (corrected after
review; rev 1 of this README said 0 at all 15), host load1 about 10 during that run (`px-chrome-selftest-775-…`).
**Script version:** the non-reduced runs (775 at 23:00Z, 932 at 23:03Z) were made by `em-p1-px.mjs` before its
`--reduced` path was added; the committed version adds only that path (and, after review, `--settle-transitions`);
the scroll walk, stops and freeze are unchanged. There is no saved copy of the earlier file (OBSERVED from my edit
history, not from a hash).
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
| same-stop P1 vs v9-final at post | 357 consistent = C's own label shift (below) | 341 = the label shift (re-run, below) | 0 |

**932 `post`, corrected after review.** Rev 1 of this README showed "-" for the 932 same-stop cell. The first run's px.json
had 1303 css px consistent there: 341 = the label shift, plus 962 at css [64,240]-[368,368], a card caught
mid CSS transition (em-p1-px's freeze finishes no transitions). Re-run 2026-10-05 23:52Z
(`px-chrome-p1-2026-10-05T23-52-24-020Z`, `--settle-transitions 5000`: before each shot, wait until no CSS transition
runs): **341 css px, max 236, box [304,32]-[400,48] = the label shift only.** No transition was running at the `post`
shot in any of the four loads (wait 0 ms), so the 962 px card state did not recur (OBSERVED, cause unknown; load1 was
about 10 in the first run and 6 in the re-run). P1 dn0 vs v9-final up0: 0. P1 dn0 vs P1 up0: 0.

**v9-final's own post-close shift (its own line, as the lead ruled):** v9-final draws the "Join waitlist" label
1 css px off after a close, like v9.2 (fix-end-morph, OBSERVED, cause unknown, a raster state after nav-earn's close
animations). Measured: C dn0 vs C up0 = **357 css px (775) / 341 (932), max 236**, box [304,16]-[416,64] css (the
label); C post vs C pre in the nav band at 932: 341, the same label. P1 keeps the pre-zone render (0). The Simulator
shows no such shift in C (0).

**Pitfall (F-301):** at the pre position after a close, the page under the nav differs from its pre-zone render in
v9-final itself (775: 26-40k css px, #platform shrink-track content; Simulator 24-32k), so that cross-stop compare
only means something in a nav band or at y = endStart.

### (b) Inside the morph zone: NOT PROVEN equal to rev 1's render (exact-m P1-only check over T2; review, 2026-10-06)

**Review finding (review-end-morph-p1, NEEDS-WORK):** comparing residue area against residue area (the table further
down) is not T2. T2 asks for the pixels P1 changes that rev 1 did not change. **Decisive check, run 2026-10-05
23:47-23:49Z (shared lane, no timing):**
- Reference: `gates/rv1-frames.mjs` (a copy of fix-morph-gpu's `frames.mjs` that adds R2, a second rev 1 load, so rev 1
  has its own A/A). Run at P1's exact m values: 775 `rv1frames-775-2026-10-05T23-46-59-619Z`, 932
  `rv1frames-932-2026-10-05T23-48-08-264Z`.
- Scorer: `gates/p1only.mjs` (review-end-morph-p1's dd.mjs, with credit; plus R's A/A, stops mapped by order, T2
  verdict and a per-band residue line).
  - P1 mask: P1 vs v9-final over 8 levels in all four cross pairs, both A/A pairs at most 8.
  - R1 mask: rev 1 vs best-build, the same rule with R/R2.
  - P1-only: the P1 mask minus the R1 mask dilated by 3 device px (1 css px).
  - T2: area ≤ 2,000 css px, ≤ 0.5 %, fill shade ≤ 64, edge shade ≤ 128.

| m (775) | P1-only css px | fill max | edge max | T2 | | m (932) | P1-only | fill max | edge max | T2 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.021 | 156 | 63 | 63 | pass | | 0.020 | 200 | 203 | 203 | FAIL |
| 0.050 | 332 | 48 | 109 | pass | | 0.050 | 363 | 154 | 194 | FAIL |
| 0.101 | 432 | **65** | 92 | FAIL | | 0.100 | 469 | 151 | 181 | FAIL |
| 0.190 | 439 | 54 | 110 | pass | | 0.190 | 492 | 76 | 151 | FAIL |
| 0.250 | 116 | 115 | 115 | FAIL | | 0.250 | 82 | 0 | 85 | pass |
| 0.501 | 100 | 157 | 158 | FAIL | | 0.500 | 79 | 74 | 174 | FAIL |
| 0.800 | 117 | 224 | 224 | FAIL | | 0.800 | 62 | 156 | 224 | FAIL |
| 0.990 | 67 | 224 | 224 | FAIL | | 0.990 | 62 | 224 | 224 | FAIL |

- **Result: T2 FAIL at 5 of 8 stops (775) and 7 of 8 (932).** The area is small: at most 492 css px, 0.13 %. The shades
  are over T2's levels.
- Per the lead's ruling, P1 on v9-final therefore does not count as the look the user accepted. It goes to the user as
  **PR-012 rev 2**, with a Try-it of P1 on v9-final, before it can land.
- Where the P1-only pixels are (viewed crops, OBSERVED):
  - Nav row (css y 16-60, x 40-407), m 0.02-0.5: the logo and the action buttons' glyph edges. v9-final and
    best-build place the logo differently (device x about 165 vs 190 at m 0.5), so rev 1's residue mask covers the
    logo at another place. That leaves P1's anti-aliasing residue on the logo outside the dilated mask.
  - Panel (css y 320-464), m 0.8-0.99: the countdown digits. The two tools freeze `Date.now` at different instants
    (em-p1-px 1791115200500, frames.mjs 1790985600500), so the digits differ ("28 17" vs "30 05"), and P1's glyph-edge
    residue lands outside rev 1's mask. This part is an artifact of the two tools.
- The kind and size of the residue match rev 1's (per band, P1 vs rev 1: area, max shade, area over 128):

  | m | 775 nav | 775 panel | 932 nav | 932 panel |
  |---|---|---|---|---|
  | 0.02 | 803/63/0 vs 814/66/0 | 23/25/0 vs 23/25/0 | 939/203/188 vs 910/203/191 | 10/22/0 vs 10/22/0 |
  | 0.1 | 997/92/0 vs 812/77/0 | 17/13/0 vs 17/13/0 | 955/181/178 vs 798/181/108 | 19/10/0 vs 19/10/0 |
  | 0.5 | 410/179/114 vs 395/179/133 | 567/26/0 vs 567/26/0 | 303/177/68 vs 320/175/64 | 535/24/0 vs 535/24/0 |
  | 0.8 | 1828/226/183 vs 1774/224/169 | 8308/236/1638 vs 8359/236/1662 | 2176/215/181 vs 2134/215/179 | 7317/236/1635 vs 7401/236/1660 |
  | 0.99 | 472/95/0 vs 472/95/0 | 5890/236/2255 vs 5920/236/2285 | 474/136/1 vs 438/135/0 | 3553/237/1304 vs 3638/237/1325 |

  That supports, but does not prove, the reading that P1 is rev 1's look shifted onto v9-final's layout. A
  pixel-exact proof would need rev 1's reference at v9-final's positions, which does not exist. The user decides.
- The earlier comparison (kept below for the record) compares areas only, so it cannot show T2.

#### Earlier comparison (rev 1 of this README; area against area, not T2)

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

### F() nav probe: PASS (but it cannot separate the arms)

- Caveat (review): is-on-dark is true at every stop in both arms, so this gate shows only that P1 changes neither the
  hit element nor is-on-dark at these stops. It could not catch an is-on-dark change.

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
- Layouts at close go up: P1 147 against C 137 and C2 132 (+10 to +15, over the C/C2 spread of 5; noted after
  review, cause not traced).
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

- Chrome paint counts barely move. The likely reading (OBSERVED, not checked against a reference): Chrome counts paint
  events per paint layer, and the reveal keeps the same layers.
- Raster tasks fall by about half in the open and close phases.
- Paint-event area goes up about 14 %: the full-size nav layer is painted once, at its final size.
- Rest closed layouts go 38 → 0. In v9-final, after the close, the nav's width transitions for 0.68 s from its last
  step's width to the pill (a 0.2 px change). Rev 1's `transition-property` override at m 0 skips that transition,
  so the nav snaps to the pill. dn0 vs the fresh up0 = 0 shows that the result looks the same.

## P-153: phone no-worse check of P1, plus a blind swipe A/B (card rev 1.2, registered before any P-153 data)

**Ticket:** P-153 (lead, 2026-10-06; reserved by mgmt-clerk-1 at 840490f4). Stage V of a less-work fix (memory
"less-work-landing-rule"): the Chrome and Simulator counts above, plus one short phone no-worse check and a blind swipe
A/B. No gain is claimed from the phone. It runs right after P-152, on the same reconnect.

**Rev 1.1 (2026-10-06, before any P-153 data).** Rev 1 was 4263125d (pre-data read by ops-reader-P153: PASS with
notes N1-N10). Rev 1.1 carries:
- P-152 rev 1.1 (fix-end-morph, ac229f7f), mirrored:
  - the reader is rebuilt from P-152 rev 1.1's reader, so clause (b), the permutation test on the mean difference, the
    part-2 end-gate void, the near bands, the EC1 slot and their self-test cases are P-152's;
  - the block driver is rebuilt from P-152 rev 1.1's driver: ARCHIVE-BLOCK1, the EXIT-trap park, and the serve check
    logged at every part start.
- The lead's late P-152 delta:
  - part 2 counts only after `HOLD HA VALID`, or after a standalone end gate right after an HA stop (new `ENDGATE` mode);
  - a VOID block 1 is archived the same way and counts as one of the 2 blocks.
- The lead's rulings on ops-reader-P153's N1-N10:
  - the FIRST-OPEN label is on f2;
  - repeat opens are split;
  - m comes from a 100lvh track;
  - the Risks erratum is fixed;
  - part S runs only after a NO-WORSE PASS and on the lead's go;
  - REDO is handled on the answer wait too;
  - three pairs with a catch pair;
  - the swipe script logs a PIN line;
  - the card has a Labels block and a p on each prediction;
  - N10: a P1 change re-pins V.

**Rev 1.2 (2026-10-06, before any P-153 data; signed rev 1.1 was 18e9073e).** It mirrors P-152 rev 1.3 (fix-end-morph,
e3c1a254), the lead's heat rules after P-152's block 1 went VOID on heat (battery 36.1 → 43.0 °C in 18 min of G runs,
Critical at the end gate):
- **Gates on every hold.** Every hold runs a start and an end thermal gate (`--expect serious --max-c 44
  --accept-induced`). Rev 1.1 gated only each phone hold's edges.
- **An end-gate FAIL voids only that hold's runs, and the block stops** (the hold exits 3, a BLOCK STOP). Those runs
  do not go to the tail; the tail still re-runs only runs whose run gates failed, at most 2 per block.
- **Per-hold validity in the reader** (`holdStatus`, copied from P-152 rev 1.3): a counted run or a sentinel counts only
  when the hold that ran it (its `RUN <item> arm` line in the current `out/p153/hold-<H>.log`) ended `HOLD <H> VALID`.
  A run in no hold log does not count. This replaces rev 1.1's part-2 rule (N3, the late delta, `part2Gate`) and the
  standalone `ENDGATE` mode, which rested on HA being part 2's only end gate. An HA end-gate FAIL now voids only HA's
  attribution runs.
- **Cooling gap.** After each hold but the part's last, when that hold's end gate read the battery at >= 41.5 °C (the
  gate's own record in `out/thermal-gate/gates.jsonl`), a logged wait: `wait.mjs phone-temp --below 40 --timeout 600`
  (`out/p153/cooling.log`). A timeout is logged, and the next hold's start gate decides.
- **At most two counted runs per hold:** the driver refuses such a plan before anything runs (the plan never has more).
- **Every block starts after cooling to 38 °C** (lead at signing: block 1 too, since P-153 follows P-152 on a warm
  phone): each block's part 1 runs with `P153_COOL_FIRST=38` (`wait.mjs phone-temp --below 38 --timeout 900`,
  logged; a timeout stops the part, exit 6, and the lead decides). Its first start gate must read Serious, induced
  Yes.
- **I-214:** every part restarts Safari with B's timer page (`iphone.mjs safari-restart`) after the WDA restart.
- **Auto-lock lesson (I-215, OBSERVED, cause unconfirmed; mirrored from P-152's card, 55df6894, doc only).** In P-152's
  block 2, WDA would not start after about 10 min of idle cooling with Safari parked ("Timed out while enabling
  automation mode"); the phone most likely auto-locked. So WDA is checked right after any cooling wait. The kit
  already does this, with no code change:
  - after `P153_COOL_FIRST` (`p153-block.sh` line 72), the part's WDA stop/start/check runs next (lines 76-77, exit 5
    before any gate or run), then the Safari restart (line 81);
  - after a mid-part cooling gap (line 109), the next hold runs `iphone.mjs wda check` before its start gate
    (`p153-hold.sh` line 79; the gate at line 83; hold VOID exit 5, no run).
  - A failed check stops the part with nothing used up. Remedy (lead, console step C-071): the user unlocked the iPhone
    and set Auto-Lock to Never for blocks.
- **Xcode condition (P-152, 03:18Z):** a cool phone whose start gate read Critical with induced Yes points at the Xcode
  Device Condition (lead step C-072: stop it, wait 2 min, start Thermal State Serious). P-153 starts only after C-072;
  if its first start gate reads Critical, the block stops with no retry and the lead is told.
- Kit: `p153-block.sh` is P-152 rev 1.3's driver (4b8c70324a81) with the names changed, and the block-1 archive also
  moves `out/p153/void`. `p153-read.mjs` takes P-152 rev 1.3's `holdStatus`, its self-test cases and its read lines.
  `p153-hold.sh`, `p153-serve.sh` and `p153-swipe.sh` are unchanged (P-152 rev 1.3 did not change its hold either).

**Labels.**
- This card is pre-data for P-153.
- The NO-WORSE prediction is informed by this build's Chrome and Simulator counts (above).
- The rule's calibration (power note) is informed by P-137 data from another build: P-137's C was v9-final + 7d; here C
  is v9-final + F1 + U2.
- The first-open definition (f2, the repeat split, lvh) and its prediction are informed by the reader smoke test on
  P-137's records (below).
- Pr2's p (0.25, rev 1.2) is informed by P-152's heat VOID (P-152 block 1, same script and profile).

**Question.** Does P1 make the end-of-page menu morph worse on the iPhone? The morph is the scroll into and out of the
end menu (open and close), with Safari toolbar steps, driven by a real touch gesture.

**Arms (one change, same base).**
- Both arms come from int-v8's immutable snapshot `out/emp1v9f/snap-4da641f828bb` (int-v8's commit 89c93bda;
  HASHES.txt sha256/12 `c5138adb7dd2`). `phone/p153-serve.sh` copies it once into `out/p153/snap`, checks it against
  HASHES.txt and allows only the four pinned files.
- C = v9-final + F1 + U2 (int-v8's landing base): JS `a6426953727a`, CSS `e1359ab9994a`.
- V = C + P1 (`delta.diff` `d310e4d2ba0c`, 0af9e816): JS `4da641f828bb`, CSS `a81b9af7b2c9`. int-v8 checked that the
  other order (v9-final + P1, then F1 + U2) gives the same bytes; ops-reader-P153 checked that C + delta.diff = V.
- B = the plain baseline, only for the thermal gate's timer page.
- Served by `phone/p153-serve.sh` (P-152's server script, new arms): plain http, `--vendors=local --latency 150`.
- Both arms' served JS and CSS are hashed before every run (each arm has its own CSS pin). A mismatch voids the hold.
- **N10:** if P1 changes (for example after the user's PR-012 rev 2 decision; see gate (b) above), V's pins change.
  Then int-v8 builds a new snapshot and the lead runs a delta check before any counted run.

**Driver and profile (as P-152).**
- Driver G: `iphone.mjs gesture` with fs = `fixes/morph-scroll/g-fastshort-v1.json`, compiled program `8737f212c0ff`,
  E procedure (first touch 4.0-5.5 s after page ready). The same script as P-152, P-137 and T-194: its swipes run to
  the page bottom and back, through the morph's opens and closes, with Safari toolbar steps.
- Hold time from `gesture --dry-run`'s `GESTURE_BUDGET_S`; a time guard re-runs a hold whole.
- Heat profile `xcode-serious` (Xcode Device Conditions, no heat pre-warm). Thermal gate at the start and the end of
  every hold (`--expect serious --max-c 44 --accept-induced`; rev 1.2).

**Plan (as P-152; at most 2 blocks).**
- One uncounted warm-up per arm port (WC, WV).
- Sentinels S0 (start) and S1 (end): Timeline-OFF runs on C, judged by the signed P-129 sentinel rule (moving fps
  >= 50, slow share <= 6 %). S0 FAIL voids the block; S1 FAIL voids every counted run.
- 8 counted runs, Timeline on, order C V V C C V V C (EC1, EV1, EV2, EC2, EC3, EV3, EV4, EC4), 4 v 4.
- Each counted run must pass the P-129 run gates G1-G6. A failed run is re-run once in the tail, at most 2 per block.
- Attribution AC1, AV1 after S1 (Timeline on, Paint records per moving frame; they decide nothing).
- Every part:
  - starts with `p153-serve.sh check`, appended to `out/p153/serve-check.log` (B, C and V served hashes). A failed
    check stops the part before anything runs;
  - then restarts WDA (stop, start, check);
  - parks Safari after every run and on every exit (an EXIT trap: the end, a stop, an error).
- Each hold runs `wda check` before its start gate. After each hold: `doing iphone --between 1`.
- **Hold validity (rev 1.2):** every run counts only when its own hold ended `HOLD <H> VALID`, that is, with its start
  and end gate passed (see "Rev 1.2" above). An end-gate FAIL voids that hold's runs and stops the block. After a hold
  whose end gate read >= 41.5 °C, a cooling gap (`wait.mjs phone-temp --below 40 --timeout 600`) runs before the next.
  - Rev 1.1's part-2 end gate (in HA only, plus the standalone `ENDGATE`) and its alignment note (the last `HOLD HA`
    line vs any `HOLD HA VALID` line) are superseded. `holdStatus` reads the last `HOLD <H>` line of each hold log.
- **Block 2 (N2, only on the lead's word after a FAIL, an INSUFFICIENT or a VOID block 1):**
  - `TICKET=P-153 sh fixes/end-morph-p1/phone/p153-block.sh ARCHIVE-BLOCK1` moves block 1 into `out/p153/block1/`:
    runs, hold logs, WDA logs, serve-check.log and void records. It then restarts the three servers.
  - It refuses when `block1/` exists, so there are at most 2 blocks. A VOID block 1 counts as one of them.
  - Block 2 runs the same two parts. Its part 1 starts with `P153_COOL_FIRST=38`, as block 1's does. It is read from
    `out/p153/runs` by itself, never pooled with block 1.

| part | holds (each a 600 s chrome-measure `--no-timing` hold, 2 fs runs at most) |
|---|---|
| 1 | H1 WC WV, H2 S0 EC1, H3 EV1 EV2 |
| 2 | H4 EC2 EC3, H5 EV3 EV4, H6 EC4, H7 TAIL (re-runs, then S1), HA AC1 AV1 |
| S (only after a NO-WORSE PASS and the lead's go) | three blind swipe pairs, the runner's own phone hold |

Runner commands (in the background, after `sh fixes/end-morph-p1/phone/p153-serve.sh start`):
- `P153_COOL_FIRST=38 TICKET=P-153 node tools/lock.mjs run iphone --owner iphone-runner --block P-153 --max-seconds
  3600 -- sh fixes/end-morph-p1/phone/p153-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2` (part 1 of every block)
- `TICKET=P-153 node tools/lock.mjs run iphone …` with `H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1` (part 2)
- block 2 only after `ARCHIVE-BLOCK1` and the lead's word, the same two commands
- part S (see below): `TICKET=P-153 P153_S_GO=lead node tools/lock.mjs run iphone --owner iphone-runner --max-seconds
  900 -- sh fixes/end-morph-p1/phone/p153-swipe.sh`
- Before the read, VOID holds' records move to `out/p153/void/<H>/`.

**Metric** (`phone/p153-read.mjs`; the end-zone metric is P-152's, unchanged):
- Per counted run, the signed P-129 reader rev 1.1 (`readRun`, role E) gives the moving frames.
- End zone = the reader's lastScreen band (scrollY >= maxY - innerHeight). On v9-final that is the morph track
  (m >= 0) and the screen before it (Chrome geometry, OBSERVED).
- n = moving end-zone frames; s(th) = those with dt > th, for th 30, 34, 38, 46, 50, 54.
- Per run, reported: the near bands (30, 38] = s30 - s38 and (46, 54] = s46 - s54, and the EC1 slot (is EC1, right
  after S0, again C's maximum, as in P-137? Descriptive).

**Decision: NO-WORSE, as P-152 rev 1.1 (mirrored).** V is judged against C at >34 and at >50 separately.
- WORSE when EITHER:
  - (a) min(V) > max(C); OR
  - (b) median(V) - median(C) > +2 at >34 or > +1 at >50, AND an exact one-sided permutation p <= 0.05 on the MEAN
    difference.
- p is the share of all C(nC + nV, nV) relabelings of the valid runs (into the arms' sizes) whose mean(V') - mean(C') is
  >= the observed one. The observed labelling is included; ties count against V. At 4 v 4 the observed split must be
  among the top 3 of 70. The permutation function is fix-end-bg's (P-150 rev 1.3), via P-152 rev 1.1.
- A threshold whose median bound is exceeded with p > 0.05 is reported ("median bound exceeded with p > 0.05"), not
  WORSE.
- Rates instead of counts when median n differs by more than 15 %; the bounds then become 2 and 1 divided by median n(C).
- Twins: >30/>38 use the >34 bound, >46/>54 the >50 bound. A twin that disagrees marks the result "threshold-sensitive".
- Precedence: VOID (a sentinel failed or is missing) > INSUFFICIENT (an arm has < 3 valid runs) > FAIL / NO-WORSE PASS.
  - NO-WORSE PASS: neither >34 nor >50 is WORSE.
  - FAIL: either is WORSE. It goes to the lead: block 2, judged by itself, or no landing.
  - "Position-confounded" is a label only: the lowest V run at a failing threshold opens its hold (EV1 or EV3).
- A re-run `<run>r` counts only when the first try is INVALID by readRun. A first try that the runner flagged only for
  a non-zero gesture exit, but that is valid by readRun, still counts, and its re-run is ignored.
- **Power note (OBSERVED, from P-152 rev 1.1's resampling of P-137's C runs; another build, 7d):**

  | V shifted by (>34 / >50) | FAIL, bound only (rev 1) | FAIL, bound and p (rev 1.1) |
  |---|---|---|
  | none (V = C) | 37-41 % | 3.2-5.2 % |
  | +6 / +2 | 79 % | 34 % |
  | +10 / +3 | 92-93 % | 44-46 % |

  At 4 v 4 and this noise, a PASS does not rule out a regression of a few frames per run. It says only that no large
  one showed. The first-open read and part S are reported next to it.
- **Self-test** (`node fixes/end-morph-p1/phone/p153-read.mjs --selftest`, 48 checks in rev 1.2). P-152's cases:
  - a V = C resample (P-137's C runs against a relabeled copy of themselves) passes;
  - P-137 as recorded passes;
  - a clear regression (P-137's arms swapped, +21 / +3.5) FAILs at both thresholds (p 1/70 and 3/70);
  - a bound-only case (+3 > +2 at >34, p > 0.05) passes and is reported with its p;
  - clause (b) alone with p <= 0.05 fails at >34 and at >50;
  - the permutation function: floors at 4 v 4, 3 v 4 and 3 v 3, ties against V, all ties.

  P-153's cases:
  - first-open: O1, f2, the repeat split, a toolbar-step open, no open, the label on f2 (and not on f1);
  - hold validity (rev 1.2, P-152 rev 1.3's cases): a VALID hold's runs count; an end-gate FAIL voids that hold's
    runs, with the hold and its last line as the reason; a time-guard try and a hold with no HOLD line don't count; a
    run in no hold log is unknown; the whole re-run of a hold counts; plus P-153's own: an HA end-gate FAIL voids only
    HA. (Rev 1.1's six part-2 end-gate cases are gone with the rule.)

**The named risk: the first frame of the open.**
- On best-build, PR-012 rev 1 paid a longer first frame when the menu opens. Source: phone P-092 (M driver), the "Phone
  block P-092: result" and P-098 sections of `fixes/morph-gpu/README.md` at 6f824153:
  - repeat opens after a full close: +7 ms (V 62 vs C 55), paid back in the next frame;
  - the first open per page load: +6.5 ms (V 41 vs C 34.5 ms, n 4, ranges overlapping, 40-49 vs 33-49);
  - rev 2 (P-098) measured the first open at +6.5 ms again, WORSE by its bound V <= C + 2 ms.
- Rev 3's guard did not remove it: the cold first open kept its repaint (32 rects / 2150 kpx vs 32 / 2160). P1 keeps
  rev 1's switch-on, so the risk stands on v9-final until the phone shows otherwise.
- **Reported per run (decides nothing in the NO-WORSE rule):**
  - m per frame = (scrollY - (docH - innerHeight - lvh)) / lvh. This is the page's own formula (C JS 14318, track
    100lvh at C CSS 12413). The run's largest innerHeight stands in for lvh (disclosed: exact only when it equals lvh;
    with innerHeight as the track, rev 1 was 40 px late at ih 775).
  - Opens are frames with m > 0 after a frame with m <= 0.
  - f1 = that frame's dt, the gap BEFORE it. f2 = the next dt, the gap in which the switch-on for that scrollY
    renders: this is P-092's first-frame number. Also reported: f12, f123.
  - O1 = the first open after load.
  - Repeat opens are split. "Full" repeat opens follow an open that reached m >= 0.99 and have no innerHeight change at
    the open frame: these are P-092's repeat opens. The rest are mostly toolbar steps moving innerHeight across m = 0
    (11-12 of 13 per run in P-137's records); they are counted, not compared.
- Per arm, the reader reports the median and range of O1.f2, f1, f12, f123 and of the per-run full-repeat f2 medians.
- It prints **"FIRST-OPEN RISK SEEN"** when median V O1.f2 - median C O1.f2 > 2 ms (rev 2's bound). That label goes to
  the lead with the result; the NO-WORSE outcome stays as decided.

**Falsification line and predictions (a p on each).**
- Pr1, block result: NO-WORSE PASS, **p 0.85**.
  - For: P1 replaces the morph's per-frame repaints with a composited clip. Simulator open: paints 442 → 208, painted
    kpx 34583 → 13337, layouts equal. Chrome raster 581 → 270.
  - Against: the rule's own false-FAIL rate (3-5 %) and rev 1's open-start cost.
- Pr2, VOID or INSUFFICIENT (sentinel, run gates, an end gate): **p 0.25** (rev 1.2; rev 1.1 said 0.10 from P-137's
  harness). P-152's block 1, same script and profile, went VOID on heat; rev 1.2's cooling gaps lower that risk, but an
  end gate now sits on every hold, and any end-gate FAIL stops the block.
- Pr3, first open: no "FIRST-OPEN RISK SEEN", **p 0.6**.
  - In P-137's records, O1 f2 was 23-32 ms with f1 16-17 in both arms. The G driver's first open lands mid-swipe,
    unlike P-092's M driver, so a +6.5 ms switch-on cost may hide or show.
  - This is the least sure prediction.
- Pr4, part S (if it runs): the user does not pick C in both real pairs, **p 0.85**. The user picks V in both real
  pairs, **p 0.35**.
- A FAIL, or the risk label, means P1 does not land as is. The next step would be moving the switch-on work off the
  open's first frame (rev 2's idea, which did not help on best-build) or a setup at page load.

**Part S: blind swipe A/B of the end-of-page menu (F, the user's finger; lead rulings N5-N8, memory
perception-tests-touch-ab).**
- **When:**
  - only after a NO-WORSE PASS block, not after a VOID, INSUFFICIENT or FAIL one;
  - only after part 2's last hold HA ended;
  - never while the P-153 block mark is set;
  - only on the lead's go: the lead first asks the user in a thread, then the runner starts the script with
    `P153_S_GO=lead`.

  `phone/p153-swipe.sh` checks all four itself and refuses otherwise (exit 2, nothing posted): the HA log's final
  line, the reader's DECISION on `out/p153/runs`, `lock.mjs status`, and the go.
- **What:**
  - Three pairs, each its own console swipe-pair step, posted one after another from inside the runner's phone hold
    (one phone step at a time, I-123):
    - C/V and V/C (AB/BA): a coin decides which comes first;
    - a catch pair C/C: a second coin puts it first, second or third.
  - Forced choice, 1 or 2 per pair (`--options 1,2`), plus a 1-5 "How different did they feel?" scale.
  - "Not sure" goes in the notes and counts as no pick. A skipped or unanswered step is no pick.
- **Instructions (plain):** "On each page, swipe down to the very end, then swipe up and down there so the menu at the
  end opens and closes a few times (about 30 seconds). Judge only that end-of-page menu. Pick 1 or 2; if you are not
  sure, pick either and write 'not sure' in the notes."
- **Runner side**, per pair and per the console protocol:
  - post the pair; ack loading; `iphone.mjs open`; ack ready; wait for Start;
  - `iphone.mjs record --seconds 45 --poll 5`; ack recording; wait for Done;
  - the same for page 2, then wait for the answer.
  - EVERY wait (the answer wait too, N6) carries `--epoch` and handles exit 5 REDO: the recorder stops and the pair
    resumes at the reset part with its new attempt. On NOT-READY the runner acks ready again.
  - A recorder that does not start within 30 s does not hold the user up: the part is acked "recording" with "not
    recorded", and the answer still counts. Records are descriptive only (finger frame rates don't compare with G runs,
    F-071).
- **Pins (N8):** a PIN line with the script's own sha and the C and V served hashes, also stored in the answer file.
- **Privacy:** the blind keys go only into each step's private `--meta` and `out/p153/swipe-key.json`. The answers go
  to the gitignored `out/p153/swipe-answer.json`: value, scale, the unblinded pick, pins and the user's notes. The
  notes stay only in that local file: never printed, never in a committed file (Hard rule 12). The README gets picks
  and scales only.
- **Landing (lead, N7):**
  - P1 lands only on a NO-WORSE PASS block;
  - and not if the user picks C in both real pairs: then it goes back to the user as a question;
  - the catch-pair pick is reported, never scored.

  Last line of the script: `SWIPE RESULT real AB <pick> / BA <pick>, catch <pick>; landing by part S: ok | NOT …`.

**Kit (pins, sha256/12, at the rev 1.2 commit).** Rev 1 pins: block `76e3fd93ee51`, hold `ba0e405b6782`, serve
`fbd214f54de0`, read `ebd8e855bf0e`, swipe `c60e12b0e298`. Rev 1.1 pins: block `06f6fbe62d5e`, read `b29d7b28c94b`,
the rest as rev 1.2.

| file | rev 1.2 pin | source |
|---|---|---|
| `phone/p153-block.sh` | `78062de712d3` | P-152 rev 1.3's driver (4b8c70324a81), names changed, archive also moves `void` |
| `phone/p153-hold.sh` | `ba0e405b6782` | unchanged from rev 1 (P-152's hold, new arms; P-152 rev 1.1-1.3 didn't change its hold) |
| `phone/p153-serve.sh` | `fbd214f54de0` | unchanged from rev 1 |
| `phone/p153-read.mjs` | `d28c6a20a931` | rev 1.1's reader (b29d7b28c94b) with P-152 rev 1.3's `holdStatus` for `part2Gate` |
| `phone/p153-swipe.sh` | `64af4ef79ad7` | unchanged from rev 1.1 (three pairs, guards, PIN) |

- Dependencies, signed and unchanged: `research/serious-heat/phone/p129-gates.mjs` `a06847c64a2e`,
  `research/serious-heat/p129-read.mjs` `06f74f5d19ca`, fs script `df597802d2f0`, thermal gate `ecb403b3ad25`,
  pmcheck `d36bd7437b7c`. Every hold prints these in its PIN line.
- Dry run (rev 1.2, 2026-10-06 00:34Z, servers up, then stopped): `P153_DRY=1 … p153-block.sh` with all eight holds:
  serve check 3 of 3, every hold DRY ok with "gates both", TAIL resolved to S1 alone. The PIN lines show block
  `78062de712d3` and read `d28c6a20a931`. A 3-counted-run hold (`H4:EC2,EC3,EV3`) is refused before anything runs
  (PLAN REFUSED). The dry hold logs were then moved to `out/p153/dry12-logs/`. The cooling gap, `P153_COOL_FIRST` and
  the Safari restart are skipped in dry mode: they need the phone.
- Dry run (rev 1.1, 2026-10-06 00:01Z, servers up, then stopped):
  - `P153_DRY=1 TICKET=P-153 sh fixes/end-morph-p1/phone/p153-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2 H4:EC2,EC3
    H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1`: every hold DRY ok.
    - Served: C `a6426953727a` / `e1359ab9994a`, V `4da641f828bb` / `a81b9af7b2c9`, B `4606120cf392` / `27776f3d4138`.
    - Compiled program `8737f212c0ff`, GESTURE_BUDGET_S 229. Gates at H1 (start) and HA (end). TAIL resolved to S1
      alone.
  - `P153_DRY=1 … p153-swipe.sh`: SWIPE DRY ok (served hashes, PIN line, coins). Its guards report the state, not
    enforced in dry mode: block not ended, no NO-WORSE PASS, no go.
  - `ARCHIVE-BLOCK1`: moved the dry logs into `block1/` and restarted 3 of 3 servers with served hashes ok. A second
    call refused. The test folder was then moved aside, so it does not block a real block 2.
  - **Dry-run limits (N6):** the dry run touches no phone, WDA, thermal gate, gesture, Timeline, console step or lock
    hold. `ENDGATE` was not run; it needs the phone.
- Reader smoke test on P-137's records (fix-end-bg's out/p137/runs, another question, used only to test parsing):
  - all 8 counted runs and both sentinels read;
  - part 2 is voided there, because P-137 has no hold-HA.log: the N3 rule works (rev 1.1; under rev 1.2 every run of
    that folder is "in no hold log", since P-137's hold logs live elsewhere);
  - O1: f1 16-17 ms and f2 23-32 ms in both arms;
  - 13 opens per run, of which 0-1 are full repeats.

## P-153 block log

- 2026-10-06 03:24:11Z, part 1, first try: **void before anything ran, not counted as a block** (lead ruling).
  - The serve check was ok for 3 of 3 servers.
  - The cooling wait (`P153_COOL_FIRST=38`) got no battery reading: `idevicediagnostics` exit 1, UNAVAILABLE after one
    read. The driver stopped with exit 6. Its text "did not cool below 38 °C in 900 s" is the driver's generic message
    for any non-zero cooling wait; here the cause was the missing reading, not heat.
  - There was no WDA restart, no gate and no run. Safari was parked by the EXIT trap, and `out/p153/runs` stayed empty.
  - Cause: the iPhone was off USB (`iphone.mjs status`: no device; WebKit proxy :9222 refused), incident I-216.
    The user was trying PR-012 by hand at the time.
  - Next: part 1 reruns once with the same command when a battery read works again.
- 2026-10-06 03:41:51Z, part 1, second try (phone back on USB at ~03:41Z; I-216 resolved): **stopped at H1's start gate,
  no run.**
  - The serve check was ok for 3 of 3 servers. Cooling: 36.19 °C, at or below 38, so no wait. WDA restarted READY,
    Safari restarted.
  - H1 (03:42:33Z): the PIN line matched the signed pins (block 78062de712d3, hold ba0e405b6782, read d28c6a20a931,
    serve fbd214f54de0), and the served hashes and the compiled program were ok.
  - H1's start gate: state **Critical**, induced Yes, battery 36.29 → 36.39 °C → FAIL ceiling (Critical). HOLD H1
    VOID start gate (no run), BLOCK STOP exit 5. Safari was parked by the EXIT trap. `out/p153/runs` stays empty.
  - As signed, there was no retry. It is the same picture as P-152's 03:18Z attempt (Critical on a cool phone with
    induced Yes), this time after C-072's restart of the Xcode condition. The lead decides the next step.
  - Lead ruling (03:45Z): **VOID before any run, not counted as a block.** The lead's read-only profile read showed the
    Xcode condition active on Serious, with the phone itself at Critical above it at 36 °C: I-201's
    "phone-above-condition" case (OBSERVED; the cause of the real Critical is unknown, perhaps the user's hand testing
    plus charging). Remedy, run by the lead: C-073 (the user stops the condition), a read until the phone is below
    Critical, a second step to start Serious and a profile read to check it. Part 1 then reruns once on the lead's
    message.
- 2026-10-06 03:54:42Z, part 1, third try, after the lead's restart of Serious (C-073, C-074; checked by a profile
  read at 03:54Z): **block 1 stopped at H2's end gate on heat; the read is VOID.**
  - The serve check was ok. Cooling: 35.59 °C, so no wait. WDA restarted READY, Safari restarted.

    | hold | start gate | runs | end gate | hold |
    |---|---|---|---|---|
    | H1 | Serious, induced Yes, 35.6 °C, PASS | WC, WV (warm-ups, exit 0) | Serious, 39.1 °C, PASS | VALID 366 s |
    | H2 | Serious, induced Yes, 39.3 °C, PASS | S0 (sentinel PASS, fps 55.2, slow 0.038), EC1 (run gates ok) | **Critical**, 41.7 → 41.9 °C, FAIL | VOID end gate |

  - The cooling gap did not run after H1, because H1's end gate read 39.09 °C, under 41.5.
  - BLOCK STOP exit 3. Safari was parked by the EXIT trap.
  - Reader (rev 1.2, `out/p153/read-part1-stop.json`):
    - S0 is FAIL ("hold H2 VOID end gate exit 3"), and S1 has no record;
    - EC1 is INVALID for the same reason;
    - DECISION VOID (a sentinel failed or is missing).
  - Heat: the battery rose about 6.3 °C in 12 min, over 4 G runs, from 35.6 to 41.9 °C. P-152's block 1 climbed the same
    way (36.1 → 43.0 °C in 18 min). Under induced Serious, Critical comes back above about 41.5-42 °C (OBSERVED, cause
    unknown).
  - The lead decides: block 2 (after `ARCHIVE-BLOCK1`, cooling to 38 °C first), or a change to the heat rules.

## PR-012 rev 2 (the user's decision, lead's order 2026-10-06)

Gate (b) failed T2, so P1 on v9-final goes back to the user as a revision of PR-012 (accepted rev 1 was P1 on
best-build). Two options; the user's decision is the spec. P-153 runs only after it, and not at all if the user
declines B.
- **Option A** = v9-final + F1 + U2 (fix A only, today's look). Try-it B patch `fixes/end-morph-p1-a/patch.diff`
  (JS a6426953727a / CSS e1359ab9994a, patch sha256/12 e93b9f136134).
- **Option B** = A + P1. Try-it B patch `fixes/end-morph-p1-b/patch.diff` (4da641f828bb / a81b9af7b2c9, patch
  sha256/12 7dc4cc60c946). The console takes Try-it patches only as `fixes/<topic>/patch.diff`, hence the two
  directories; they hold nothing else.
- Both Try-it A pages = v9-final (`fixes/v9-best/patch.diff` on main).
- `tryit/mk-tryit.mjs` writes both baseline-relative patches from the P-153 snapshot arms (`out/p153/snap/{C,V}`, pins
  checked) and re-applies each one with the strict applier to the same bytes.
- Shots: `em-p1-px.mjs --engine chrome --a out/p153/snap/C --v out/p153/snap/V --h 775 --label pr012r2 --ms
  0.1,0.25,0.5,0.8,0.99,1 --down 0 --settle-transitions 3000` (shared lane, no timing). Option A against v9-final
  (the 23:00Z run, same tool, same frozen clock): within the A/A at every stop except dn0, where v9-final's own
  post-close label shift (357 css px, above) shows in the old run and not in the new one (OBSERVED, one run each).
  `post` differs in both A/A pairs (a card under the nav mid fade, the load-phase class above).
- Phone Try-it links are turned on only after P-152's block ends (no phone use by the user during a block).

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
- **Phone (erratum after ops-reader-P153 N4).** Rev 1 of this README said rev 1's P-092 open cost (+7 ms) was traced
  to #platform's opacity crossing 1 and fixed by rev 3's guard. Corrected, from `fixes/morph-gpu/README.md` (6f824153):
  - The +7 ms was the repeat opens after a full close (V 62 vs C 55).
  - The first open per page load was +6.5 ms (41 vs 34.5 ms, ranges overlapping). Rev 2's P-098 measured +6.5 ms again.
  - Rev 3's guard removed the fade's share of the warm opens. The cold first open kept its repaint (32 rects / 2150 kpx
    vs 32 / 2160, "not the fade").
  - So the open-start risk stands for P1 on v9-final. P1 has not been on the phone on v9-final. Card P-153 above reads
    the first open after load per run (label on f2).
- **Inherited untested items from rev 1** (fix-morph-gpu's list): rotation, the stale clip on the device, rapid
  re-entry while a tween runs, Android Chrome, DPR 2 phones. None of them was checked for the port.
- **Stacking:** P1 stacks with int-v8's v9-final + F1 + U2 with no shared lines (above). The lead decides when.
- Measurement code was not changed. The gate scripts are copies with credit; `em-p1-px.mjs` adds only the walk limit,
  the stops, the cross scores, `--reduced` and (after review) `--settle-transitions`. `gates/rv1-frames.mjs` is
  fix-morph-gpu's `frames.mjs` plus R2; `gates/p1only.mjs` is review-end-morph-p1's scorer plus R's A/A and a T2
  verdict.
