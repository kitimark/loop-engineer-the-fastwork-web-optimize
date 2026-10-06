# v10: main's v9-final (rev 7d) + P1 + P1b (a) + #platform pause + hit-skip + PR-027 nolift + I-219

## Build card (built 2026-10-06 15:28Z on the lead's go, 15:00Z and 15:27Z)

```
BUILD v10 on base C = main's v9-final rev 7d (1b2eecc66011 / e1359ab9994a)
  snapshot out/v10/snap-61257aa0969a-fb9f6aa28ad4 (HASHES.txt sha256/12 4bf1c71059d2), arms:
  C  1b2eecc66011 / e1359ab9994a   main's v9-final (rev 7d)
  CI 30d41592a308 / e1359ab9994a   C + I-219
  N  bd73d4223822 / 76ba9f971926   C + pause (c) + hit-skip + P1 + P1b (a)
  V  61257aa0969a / fb9f6aa28ad4   N + nolift + I-219 = v10
deltas (sha256/12 of the owner's bytes):
  pause (c)   a3ac3885:fixes/end-morph-f12/fade/c-pause-at-0.diff   2c8f3cef03a9 (fix-end-morph)
  hit-skip    main:fixes/hit-skip/delta.diff                         dee89e00eb7a (arch-compositor-morph, e6411f27)
  P1          fixes/end-morph-p1-v9f/p1-delta.diff                   d310e4d2ba0c (fix-end-morph-p1)
  P1b (a)     d52d14cd:fixes/end-morph-p1b-a/delta-{js,css}.diff     27408c23ede4 / d20484088a03 (fix-end-morph-p1)
  nolift      fixes/v10/nolift-delta.diff                            074e4667190a (PR-027, the user's pick)
  I-219       main:fixes/i219-hydrate/delta.diff                     947c88282561 (fix-i219-hydrate)
served hashes (serve.mjs --overlay V, curl, 15:28Z): JS 61257aa0969a, CSS fb9f6aa28ad4, x-mirror-source: overlay
routes: R1 = R1b = R2 = R4 byte for byte (R3 n/a: the nolift arm as tried carries F1+U2).
  R4 rebuilds the build the phone measured in P-156: A0 = v9-final + I-219 + P1 + P1b (a), pinned 888ed8eb2d15 /
  cfb8b8c5b019. Then + pause + rev 7d's diff + hit-skip + nolift = V.
code parity: every step of R1 and CI changed exactly its delta's lines (8 steps, 0 differences); node --check on C, N, V, CI
parity (pixels), per component, owners' gates:
  pause      Chrome 0 px at 18 stops; Simulator within T2 (fix-end-morph)
  hit-skip   Chrome max consistent 0.0057 % (level 19); Simulator no consistent difference (arch-compositor-morph)
  nolift     only the earn button region, plus post-stop noise below the Simulator A/A floor (this README)
  P1 + (a)   fix-end-morph-p1's gates (fixes/end-morph-p1b-a)
  combined   not re-run on these arms yet
a11y diff (token counts C -> V): aria-hidden JS 48 -> 52 (P1 + (a) hide P1's dark and glass decoration layers);
  visibility JS 8 -> 10, CSS 26 -> 27 (the new decoration layers' own show/hide); inert 4 -> 4, tabindex 4 -> 4,
  focus JS 16 -> 16 / CSS 24 -> 24 (unchanged)
mechanism delta:
  hit-skip   Simulator layouts HS < HSC in both pairs: 621 vs 656, 573 vs 610
  pause      #platform's running animations 8 -> 4 (in #platform 4 -> 0); composite/frame 0.682 vs 0.683 ms; layers
             44 / 117.0 MB in both (phone, m 1, fix-end-morph)
  P1 + (a)   per P-156 (fix-end-morph-p1)
KNOWN COST: first open +11 ms on the phone (O1.f2 37.5 vs 26.5 ms, P-156, A0 vs C0). The lead ruled P1 + (a) into v10 with it.
idle triple, memory/layers: not measured on the combined arms (pause's layers as above; hit-skip layers 68 at m 0.5 and m 1 in both)
prediction: none (less-work components; no timed claim for the combination)
debug hooks: none added; __fwMorphDrive / __navMorphSet come with main's C (rev 7d), same counts in C and V
pending: Simulator counts (fixes/v10/em-sim.mjs) on C / V
```

The build: `fixes/v10/build.sh` with `NAV=none PAUSE=… HS=… P1B=… I219=… PIN_A0=888ed8eb2d15/cfb8b8c5b019
PIN_N=bd73d4223822/76ba9f971926 PIN_V=61257aa0969a/fb9f6aa28ad4`, in a shared check hold.

The rest of this README is the history: the pre-stage (F1+U2 base) and its parity runs.

int-v8. The lead accepted the plan and asked for a pre-stage on 2026-10-06. The user then picked PR-027 option
"nolift", and the lead added it.

v10 lands only after the P-153 (P1) and P-152 (F1+U2) reads pass. If either fails, v10 drops that delta and the lead
re-rules.

**Update 2026-10-06 (lead 11:33Z-11:50Z): the arms below are the pre-stage, not the v10 that will be built.**
- P-152 failed and P-155 confirmed it, so F1 and U2 are out.
- CLOCK is closed-no-fix, and PANELH is deferred.
- v10 = rev 7d + #platform pause (c) + P1 [+ P1b (a)] + nolift + I-219, NAV=none. P-156 decides P1 + P1b (a) as a pair.
- The rebuild waits for the lead's go after P-156. Its three outcomes are under "The v10 rebuild" below.
- The pixel results below were measured on the pre-stage arms (snapshot 0f91ea014cb3): N = C + F1+U2 + P1, V = N + nolift.

**Verdict (Chrome only so far; the Simulator counts and the Simulator A/A are required and still pending):**

- code parity: 0 differences (script PASS);
- U2 parity on the rev 7d engine: PASS (script);
- fling-out: PASS (script);
- the stack's effect is the same on both bases at all 20 stops (script EFFECT MATCH).

The script did **not** pass the pixel checks. `nlregion.mjs` printed NLREGION FAIL in all three runs:

| run | what failed |
|---|---|
| px-nl | the post stop: 99 device px outside the button |
| px-tryit | 2 stops: dn0.5, 2 px; post, 15 px |
| px-meas | 1 stop: post, 165 px |

"Nolift changes only the earn button" and "identical to the Try-it build / the measured build" are the lead's ruling:
**within the gate's A/A noise (T2)**, based on the A/A runs below. They are not a script PASS, and not 0 px.

## Arms (immutable snapshot `out/v10/snap-f5068db34a32-a4ed5432f2f7`, HASHES.txt sha256/12 **0f91ea014cb3**)

| arm | build | JS | CSS |
|---|---|---|---|
| C | main's v9-final since 189ca7ed: baseline + `fixes/morph-scroll-v9try/patch.diff` (6d1632eb0ee9), rev 7d | 1b2eecc66011 | e1359ab9994a |
| N | C + F1+U2 + P1: v10 before nolift (the pre-stage, d37aacb0) | f5068db34a32 | a81b9af7b2c9 |
| V | **v10** = N + nolift | f5068db34a32 | a4ed5432f2f7 |

Full V hashes:

- JS f5068db34a32d5c930b4e4c7d9f175be2b0299dd6c644978b34eed44c1ae2662
- CSS a4ed5432f2f7e32bf20c37ff602fb4895948d3eb42ef42a7a00b214bf1b793ad

The deltas:

| delta | file | sha256/12 | source |
|---|---|---|---|
| F1+U2 | `fixes/nav-hit-cache/patch-on-v9f-f12.diff` | befc17cec97f | fix-end-morph's `end-morph-f12/delta.diff` @293876b8 |
| P1 | `fixes/end-morph-p1-v9f/p1-delta.diff` | d310e4d2ba0c | fix-end-morph-p1's `end-morph-p1/delta.diff` @0af9e816 |
| nolift | `fixes/v10/nolift-delta.diff` | 074e4667190a | extracted here (below) |

**The nolift delta** is CSS only. It deletes `transform: translateY(calc(var(--earn-out) * -8px))` from
`.start-selling-top-nav-btn.is-earn` and leaves a comment in its place: the button no longer rises 8 px.

- Extraction: the measured build 4da641f828bb's CSS (a81b9af7b2c9) diffed against the CSS of the arm the user tried,
  `fixes/joinwl-nolift/patch.diff` @9f9f703f (bec7169bd7cc).
- That arm is 4da641f828bb / a4ed5432f2f7: its JS is exactly the measured build's.

## Build: `sh fixes/v10/build.sh`

Every apply is `patch -p1 -F 0`: offsets are allowed, fuzz is not. Every step is pinned. V is built by four routes, and
all four give the same bytes:

| route | steps |
|---|---|
| R1 | C, then F1+U2 (738bc075f7f8 / e1359ab9994a), then P1 (= N), then nolift |
| R1b | C, then nolift (1b2eecc66011 / edc20be46534), then P1 (291f70523bd6 / a4ed5432f2f7), then F1+U2 |
| R2 | rev 7d's own diff (v9-final 647c9ef2b1e2 to C: JS only, 4 hunks, 326167f95dc6) on the measured build 4da641f828bb, then nolift |
| R3 | rev 7d's own diff on the nolift arm exactly as the user tried it (baseline + `joinwl-nolift/patch.diff` @9f9f703f) |

**Code parity** (`fixes/v10/codeparity.mjs`, multisets of removed and added lines, context ignored):

| comparison | file | lines removed | lines added | differences |
|---|---|---|---|---|
| C to V vs F1+U2 + P1 + nolift | JS | 3 | 157 | 0 |
| C to V vs F1+U2 + P1 + nolift | CSS | 1 | 66 | 0 |
| N to V vs nolift | CSS | 1 | 1 | 0 |

Negative control: C against the measured build (no rev 7d) fails with 15 differences, all of them rev 7d's lines.

The build refuses when:

- the baseline is not the pinned snapshot;
- a patch file is not its pinned hash;
- a step is off its pin;
- the routes differ;
- code parity fails;
- V fails `node --check`;
- the snapshot holds extra files;
- the snapshot already exists.

### The v10 rebuild: three outcomes of P-156 (dry-checked, nothing built)

The lead's v10 (11:33Z, 11:48Z, 11:50Z): main's v9-final rev 7d + #platform pause (fix-end-morph option c) + P1 [+ P1b
(a)] + nolift + I-219, NAV=none. F1, U2, CLOCK and PANELH are out. P-156 judges C + P1 + P1b (a) as a pair against C,
so v10 may ship without P1. The build waits for the lead's go after P-156.

Common slots: `NAV=none PAUSE=a3ac3885:fixes/end-morph-f12/fade/c-pause-at-0.diff PAUSE_SHA=2c8f3cef03a9
I219=main:fixes/i219-hydrate/delta.diff I219_SHA=947c88282561`.

| outcome | extra slots | N (JS / CSS) | V (JS / CSS) |
|---|---|---|---|
| no P1 | `P1=none` | c9d89ba3b931 / 192f62c106d1 | 68312162e859 / 9b82a98515ba |
| P1 + P1b (a) | `P1B="d52d14cd:…/delta-js.diff d52d14cd:…/delta-css.diff" P1B_SHA="27408c23ede4 d20484088a03"` | 83b68de5a21f / 76ba9f971926 | 2dd7cbc09de2 / fb9f6aa28ad4 |
| P1 alone (only if ruled separately) | none | 84c661d972c8 / 736911f655f2 | 8e05aa13c61d / 1b344025dadd |

- In all three: R1 = R1b = R2 byte for byte, and code parity is 0 in every step. R3 is skipped (the nolift arm as tried
  carries F1+U2 and P1). CI = C + I-219 = 30d41592a308 / e1359ab9994a.
- `P1=none`: R1b's "C + nolift + P1" pin and R2's measured-build pin become printed hashes. `P1=none` with `P1B` refuses
  (P1b sits on P1), and so does any other `P1` value.
- PAUSE per base. On v9-final 647c9ef2b1e2 (P-155's C, where fix-end-morph served it) it gives JS db7257e81859, CSS
  192f62c106d1. The no-P1 route's R2 reproduces exactly that step. On rev 7d's C 1b2eecc66011 it gives JS c9d89ba3b931,
  with the same CSS. The changed lines are the same 6 on both bases, at the same line numbers.

## Overlap with rev 7d

Line numbers are v9-final's, from `diff -U0`.

- **rev 7d:**
  - 14170: comment;
  - after 14221: `__msF0`;
  - 14258-14259: `__msSettle`, the fling-down exception;
  - 14282: touchstart records `__msF0`;
  - after 14285: an inert `__msDbg` log;
  - no CSS change.
- **F1+U2:**
  - after 14033: `__nsMsPend`;
  - after 14137: `_()` defers its test to `__msTick`;
  - 14156: F1 `visibility`;
  - 14312-14313: the `__msTick` morph-value write.
- **P1:**
  - JS: after 14589 (139 lines) and after 14718;
  - CSS: after 12414 / 12415.
- **nolift:** CSS 11962 only.

All of these are disjoint at the line level. The nearest pair is F1 at 14156 and rev 7d at 14170, 14 lines apart.

- On R1, F1+U2 applies at offset -159. That offset comes from the delta's own hunk headers, so it is the same on v9-final.
- P1 applies at +21 in the JS and exactly in the CSS.
- nolift applies exactly.

rev 7d and U2 work on the same morph-scroll machinery (code reading, OBSERVED), hence the fling-out probe:

- rev 7d lets a fast fling-down leave the end screen by its own momentum;
- U2 moves the nav hit test into `__msTick` while the morph is open.

## Parity results (shared lane only: probe holds, 300 s each; nothing timed)

### U2 parity on the rev 7d engine: PASS

- Tool: `fixes/nav-hit-cache/probe.mjs parity --base v10u2`; base added for fix-nav-morph's tool, credited (5a4340a0).
- Builds: C = 1b2eecc66011 + P1 (291f70523bd6), V = N, VA = N + the audit hook (f71b57bcff8a).
- **The arm named "V" in this run's JSON is N**, f5068db34a32 / a81b9af7b2c9, without nolift. It is not v10's V.
- Coverage: 5 cases (mobile, desktop, desktop-rtl, mobile-rtl, mobile-shift), task and raf modes at 10 and 40 px.
- Results:
  - 0 deferred mismatches (187 or 47 deferred frames per mobile run);
  - theme and pill entries only in raf mode, with 0 in sync (the same pattern as the v9-final PASS);
  - F1 state: hidden at the end, visible at the top;
  - 0 errors.
- Runner: `fixes/v10/parity.sh`.
- Nolift is not in VA: it only changes a transform on the earn button, which has `pointer-events: none`.

### Fling-out probe: PASS

- Tool: `fixes/v10/flingout.mjs`. Builds C, V and VA of base v10u2. 430x775, touch, hover:none / pointer:coarse.
- **"V" in `flingout.json` is N** (f5068db34a32 / a81b9af7b2c9, no nolift), and VA is N + the audit hook. Nolift was not
  in the fling probe.
- Synthetic finger from open (m = 1). Each step runs in a task after a frame (input order).
- rev 7d's own lift log confirms which path each scenario took.

| scenario | finger | path taken | end state, all three builds |
|---|---|---|---|
| fast | v -6.0 px/ms, 4 moves, 400 px | left to momentum | left the end screen (y 4943 < endStart 5189), m 0 |
| slow | v -1.8 px/ms, 3 moves, 90 px | the old smooth close | the closed rest exactly (y 5189), m 0 |

- VA audit: 0 theme mismatches and 0 deferred mismatches (fast: 9 deferred frames; slow: 28).
- is-on-dark at rest is the same in C, V and VA; it never flipped during the fling.
- 0 errors.

### Chrome pixels at the morph stops

- Tool: `fixes/v10/gates/em-px.mjs`, a copy of fix-end-morph-p1's em-p1-px.mjs @0af9e816, credited.
- Its STATE also reads the earn button's rect.
- 430x775 DPR 3. 20 stops: pre, up0..up1, dn0.5/0.1/0, post.
- Each run makes four loads (A, V, A2, V2). "Consistent" is the PR-010 score: a difference over 8 levels in all four
  cross pairs while neither A/A pair is.
- Region checks: `fixes/v10/nlregion.mjs`. Runner: `fixes/v10/chrome.sh`.

| check | result (nlregion script verdict in brackets) |
|---|---|
| nolift: N vs V | [NLREGION FAIL: 1 stop] differs only at up0.02-up0.19 (10.8k-31.3k device px). Every cluster is inside the earn button's rect + 28 px. The other stops are identical, except post: 99 device px (11 css px²) at the nav bar and p.is-price, outside the button |
| v10 vs the nolift Try-it build | [NLREGION FAIL: 2 stops] identical at 18 of 20 stops. dn0.5: 2 device px (max level 18, nav bar). post: 15 device px (max 46, nav bar) |
| N vs the measured build 4da641f828bb | [NLREGION FAIL: 1 stop] identical at 19 of 20 stops; post: 165 device px (nav bar / price) |
| effect cross-check (C to N vs v9-final to measured; `fixes/v10/effectcmp.mjs`) | **match at all 20 stops**: same stops differ, same largest-cluster box, amounts within 0.2-0.8 % |

**Noise floor (A/A, `fixes/v10/aa.sh`).** The Try-it build was put through the same gate against itself, twice.

| A/A run | stops with a consistent residue |
|---|---|
| 1 | post: 30,315 device px |
| 2 | post: 121 device px; up0.8: 18; up0.95: 170 |

**A/A on v10's V itself** (review-v10 request), with A = V = out/v10/snap-…/V:

| run | result |
|---|---|
| 1 (full, 20 stops) | identical at all 20 stops (NLREGION PASS) |
| 2 (`px-split.sh`, group g4 only, 180 s hold) | pre, up0, up0.99, up1, dn0.5, dn0.1, dn0 identical; post 32 device px, nav bar (NLREGION FAIL: 1 stop) |

So on identical bytes dn0.5 was 0 px in both runs. The 2 px dn0.5 residue against the Try-it build is **not**
reproduced by an A/A at dn0.5 itself. What backs it is the general size of A/A residues at other stops (Try-it A/A:
18 px at up0.8, 170 px at up0.95) and T2. post differs on identical bytes in 3 of 4 A/A runs.

So the post stop is never quiet: nav bar and price, over 1.3 % A/A in every run. Small consistent residues also appear
at other stops with identical bytes on both sides. The residues in the table above are within that noise. The cause is
OBSERVED only: post-close animations, and sub-pixel anti-aliasing at the nav bar.

**Lead ruling (2026-10-06, on 64a59016):** v10 is **identical to the nolift Try-it build within A/A noise (T2)**. This
is not a "0 px" result:

- the leftovers (dn0.5: 2 device px; post: 15 device px) are smaller than the A/A residues on identical bytes;
- they are far inside T2 (fill 64, edge 128, 0.5 %).

The same reading applies to N against the measured build (post: 165 device px). Nolift's +5 restOpen paints (counts
below) are logged as OBSERVED, cause not traced, and do not block.

### Chrome counts

- Tool: `fixes/v10/em-chrome.mjs`, a copy of fix-end-morph-p1's em-chrome.mjs, credited.
- 430x775, one step per frame, touch held.
- Each cell: paints / paint area / raster tasks.

| phase | v10 | v10 pre-nolift | measured 4da641 | main 1b2e | v9-final 647c |
|---|---|---|---|---|---|
| open | 250 / 144.4M / 280 | 250 / 144.4M / 272 | 250 / 144.4M / 270 | 324 / 127.9M / 581 | 324 / 127.9M / 582 |
| restOpen | 15 / 20.9M / 11 | 10 / 15.1M / 15 | 10 / 15.1M / 16 | 122 / 113.3M / 12 | 122 / 113.3M / 11 |
| close | 287 / 147.3M / 296 | 285 / 144.4M / 306 | 285 / 144.4M / 305 | 320 / 128.8M / 554 | 320 / 128.8M / 542 |
| liftOpen | 165 / 152.6M / 210 | 161 / 146.8M / 202 | 159 / 143.9M / 202 | 377 / 265.6M / 358 | 377 / 265.6M / 359 |
| liftClose | 372 / 281.3M / 328 | 373 / 281.3M / 330 | 373 / 281.3M / 343 | 366 / 270.5M / 411 | 366 / 270.5M / 407 |

- **The stack does the same on both bases.** v10 pre-nolift = the measured build, and main = v9-final, within a few
  raster tasks.
- **Nolift's apparent paint cost did not repeat.** The first run gave restOpen 15 paints for v10 vs 10 for pre-nolift.
  The repeat (review-v10 request, 180 s holds) gave the reverse:

  | build | restOpen paints, run 1 | restOpen paints, run 2 |
  |---|---|---|
  | v10 | 15 (20.9M px) | 10 (15.1M px) |
  | pre-nolift | 10 (15.1M px) | 16 (18.0M px) |

  The other phases are within ±2 paints between runs. So the +5 is run-to-run noise in restOpen (10-16 paints), not a
  nolift cost (OBSERVED). Either way it is far below main's 122.
- #platform opacity sample (rev 3's guard): 0 frames at or above 1 in all five builds.

### Simulator pixels (fw-sim 15 Pro Max; shared simulator holds, pixels only)

- Runner: `fixes/v10/px-split.sh sim`. It runs em-px in half groups (two up stops each, plus pre, up0 and post).
  - It uses resumable sessions: em-px `--arms`/`--out`, and `pxmissing.mjs` names the loads still missing.
  - Sessions were capped at 120 s, or 300 s when no phone block was marked.
  - `pxscore.mjs` scores a group whose last session hit its cap after the last load.
- **Page offset.** Simulator shots are the whole screen (1290x2796), and the page starts 59 css px below the top (the
  status bar).
  - Proof (`simtop.mjs`): the edges of the nolift diff match the earn button's rects + 59 within 1 px.
  - `nlregion.mjs --top 59` moves the button region by that offset.
  - It sets aside clusters wholly above the page top as "status bar, not judged". The status-bar clock changes by the
    minute, so loads from different sessions differ there on identical bytes (nolift g4c: 47 px at every stop).
- **Scorer fix (F-314, f5826c5b + 353ee6aa).** pxlib now decodes every shot to RGBA. No v10 gate folder mixes RGB and
  RGBA shots, so no score changed.

**Nolift (N vs V; `nlregion --top 59`):**

- Every consistent difference is inside the earn button's region (+28 css px), except the post stop and one up0.05
  cluster.
  - The up0.05 cluster is 660 px, level 38, at the left of the header.
  - The post differences sit on the #platform card: 0 to 15993 px per group (0.44 % of the screen at most).
- g2b is a script PASS; every other group fails on exactly one stop (post, or up0.05 in g1a).

**v10 vs the nolift Try-it build:** identical at every stop except post in g1, g2, g3a and g4c:

| group | post consistent |
|---|---|
| g1 | 9 px |
| g2 | **287 px** |
| g3a | 7 px |
| g4c | **41566 px** (1.15 % of the screen) |

**The post stop is not quiet on identical bytes.** Simulator A/A, V against itself, all 9 groups, 12:24-15:20Z, in 120
s sessions. The table shows the post stop; "shift" is the post card's vertical offset of V/A2/V2 against A in device
px, from `postshift.mjs`.

| A/A group | every other stop | post consistent | shift V/A2/V2 |
|---|---|---|---|
| g1a | identical | 0 | 2/2/0 |
| g1b | identical | **418 px** | 0/1/0 |
| g2a | identical | 46 px | −4/−3/−1 |
| g2b | identical | 0 | −3/−4/0 |
| g3a | identical | 23 px | 1/3/6 |
| g3b | identical | **51892 px** (1.44 % of the screen) | 2/0/2 |
| g4a | identical | 0 | 0/1/−1 |
| g4b | identical | 0 | 2/1/0 |
| g4c | identical | 0 | −6/0/0 |

- Every stop except post is identical in all 9 groups, so the Simulator is quiet there.
- Post leaves up to 51892 px on identical bytes. Both Try-it post readings are **below that A/A residue and are not
  real differences**: 287 px at g2 and 41566 px at g4c.
- Mechanism: the post card sits a few device px higher or lower per load (−6..+6 here; −5..+3 in the earlier runs), on
  the same build too. When A and A2 happen to align while V and V2 sit together elsewhere, the shift passes the
  "consistent" filter.
  - g3b's 51892 px is exactly that: A and A2 at 0, V and V2 at +2.
  - Try-it g4c's 41566 px had the same pattern: A and A2 at 0, V and V2 at +2/+3.
- Cause of the per-load offset: OBSERVED only (the post-close settle position varies by a few device px per load).
- Split sessions put the A/A pairs of a group in different sessions. That loosens nothing in the page; the status-bar
  clock above the page is set aside.

### Simulator counts: pending

- `fixes/v10/em-sim.mjs` (a copy of fix-end-morph-p1's, credited) runs on the real v10 arms after the rebuild (lead
  11:34Z: the counts on the old arms were skipped).
