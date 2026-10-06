# v10: main's v9-final (rev 7d) + F1+U2 + P1 + PR-027 nolift

int-v8. The lead accepted the plan and asked for a pre-stage on 2026-10-06. The user then picked PR-027 option
"nolift", and the lead added it.

v10 lands only after the P-153 (P1) and P-152 (F1+U2) reads pass. If either fails, v10 drops that delta and the lead
re-rules.

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

### Simulator: pending

- Runner: `fixes/v10/sim.sh`, in shared simulator holds.
- Pixels: the nolift region check, and v10 vs the Try-it build.
- Counts: `fixes/v10/em-sim.mjs`, a copy of fix-end-morph-p1's, credited.
- These are DEFERRED while a phone block is marked (P-153 block 2 at the time of writing) and run in the next window.
