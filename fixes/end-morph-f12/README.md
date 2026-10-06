# Fix: end-morph-f12 (F1 + U2: less work in the end-of-page morph)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** landing gates on v9-final PASSED at T2 (Chrome and Simulator pixels, self-tested; Chrome counts; Simulator counts). Earlier on v9.2: Chrome counts on the final build, Chrome pixels (gate self-tested), Simulator
pixels and counts. No timing run and no phone run yet. v9.2 is NO-LAND (lead, 2026-10-05), so this
change lands on v9-final (JS `647c9ef2b1e2`, CSS `e1359ab9994a`, engine 7c). There `delta.diff` applies with `patch -F0`
(offsets -159 / -7), giving trial JS `a6426953727a`, which is the same file as int-v8's trial. The landing gates run on
int-v8's pinned v9-final snapshot.
**Stage:** F (build) of a less-work candidate for v9.3 (lead ruling 2026-10-05: "F1 + U2", F2 dropped).
**Device class / gate:** phone-only, render-bound. Landing per memory "less-work-landing-rule": cost-card counts, then
a short phone no-worse check (later in the phone queue, through the lead).
**Driver(s) behind the claims:** Chrome counts (rAF-stepped `scrollTo`, touch held; lift + settle; emulated toolbar
steps). No S, W, M, G or F phone run.
**Base:** v9.2 = v9.1d (JS `941aa13e5bdf`, CSS `f1997edf5309`), `fixes/end-morph/overlay`.
**Build:** JS `3625c64871fa`, CSS `f1997edf5309` (unchanged). `delta.diff` = the change against v9.2 (50 lines);
`patch.diff` = against the baseline snapshot (carries v9.2 too).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: `S()` (v9.2 line 14315, one statement) and U2's three
places (`__nsMsPend` declaration near 14193, `_()` near 14297, `__msTick` 14478-14479).
**Credit:** U2 is fix-nav-morph's (fixes/nav-hit-cache, `u2-delta-on-v91d.diff`, sha256/12 `8b5206c8b206`), applied
unchanged with `patch -p1`.

## What changed

- **F1** (`S()`): `#platform` gets inline `visibility: hidden` in the same write that sets `--morph-fade` to 0
  (m >= 0.55, `QM`), and loses it in the write that sets fade > 0. At fade 0 the section is already at opacity 0 and
  `pointer-events: none` (same statement), so nothing visible changes by construction; the frozen-frame check below
  measures it.
- **U2** (fix-nav-morph): while the 7d morph is open on touch phones, `_()` no longer runs the nav hit test `F()`
  itself; `__msTick` runs it once after it has written the new morph value (at m <= 0.2, the only range where the
  answer shows), keyed on the value that shows.
- **F2 dropped** (lead, 2026-10-05): moving `__nsOnScroll`'s `scrollY` read into the engine's rAF gave no count gain
  in Chrome (the forced style pass only moved: open 62 -> 59, close 76 -> 76; style is already dirty from animations at
  rAF time, so the read pulls the frame's own recalc forward). Not in this build.

## Why it should be less work (mechanism)

- Phone (P-137 re-read, OBSERVED in our setup, cause unknown): on Safari toolbar steps in the end zone, #platform's
  tiles and its composited parts (stage artboard, secure-network parts) repaint, also at m >= 0.55 where the section is
  at opacity 0. A `visibility: hidden` subtree paints nothing, so in the 0.55 <= m <= 1 bin those repaints cannot happen
  (27 of C's 76 slow P-137 frames sit in that bin). Whether the step repaint is the dominant cost there on the phone is
  the open question for the no-worse check.
- Chrome (below): at rest open and on toolbar steps at m = 1 Chrome itself repaints #platform's animated parts every
  frame at opacity 0; F1 stops that.
- U2: fewer `getBoundingClientRect` + `elementsFromPoint` calls per morph frame.

## Cost card (Chrome, counts only)

Run: `fixes/end-morph/em-chrome.mjs --toolbar`, Chrome 154, 430x775 DPR 3, touch, no throttle, one shared slot.
- Final build `3625c64871fa` (F1 + U2): `out/end-morph/em-f1u2-775-2026-10-05T22-41-02-487Z.json`.
- v9.2 base: `em-v92r3-775-2026-10-05T21-58-19-288Z.json`.
- An earlier run on F1+F2+U2 (`em-f12-775-...21-57-33`) agrees within a few counts.

Totals per phase, v9.2 -> F1+U2. Phases not listed are equal within 2 counts (approach, rest closed, drag open, lift +
settle to closed, every step at m 0).

| phase (frames) | Paint events | paint area (Mpx) | styled elements | dirty layout objects | hit tests `F()` from `_()` |
|---|---|---|---|---|---|
| open (40) | 324 -> 259 | 128 -> 126 | 1404 -> 1580 | 160 -> 184 | 14 -> 0 |
| rest open (40) | **122 -> 4** | **113 -> 9** | 402 -> 399 | 0 -> 0 | - |
| close (40) | 320 -> 285 | 129 -> 126 | 1074 -> 1245 | 131 -> 155 | 26 -> 0 |
| lift + settle to open (90) | **377 -> 157** | **266 -> 127** | 1176 -> 1273 | 60 -> 84 | 11 -> 0 |
| drag close (20) | 163 -> 124 | 64 -> 61 | 410 -> 660 | 57 -> 81 | 17 -> 0 |
| toolbar step up at m 0.5 (30) | **122 -> 14** | **86 -> 17** | 336 -> 420 | 16 -> 40 | - |
| toolbar step up at m 1 (30) | **85 -> 1** | **84 -> 3** | 226 -> 226 | 13 -> 13 | - |
| toolbar step down at m 1 (30) | 125 -> 41 | 86 -> 39 | 417 -> 320 | 34 -> 34 | - |

Notes on the table:
- **Forced style passes are unchanged** (open 62 -> 62, close 76 -> 77). U2 removes the hit tests from `_()`
  (`getBoundingClientRect` + `elementsFromPoint`), but the forced style pass they paid moves to `__msTick`'s
  `window.scrollY` read (`style __msTick:14467`, 14 in open, 27 in close). Chrome's style is already dirty from the
  animations by rAF time. So in Chrome, U2 saves hit tests, not style passes. WebKit's `scrollY` forces style +
  layout anyway (2.4 in `fixes/end-morph/README.md`, CONFIRMED).
- At m 0.5 the toolbar step pushes m past 0.55, so F1 hides #platform there too. Stepping down from m 0.5 stays below
  0.55: 117 -> 117.

- **One-off cost of F1 (the return frame):** each crossing of fade 0 restyles the #platform subtree once: about +150
  styled elements and +24 dirty layout objects per open and per close (rows open, close, lift). It falls in one frame
  (hide at m 0.55 going in; show at m < 0.55 coming back). The show frame also repaints #platform (it was not painted
  while hidden): the open/close Paint totals above already include it.
- **Rest check (F-268 / F-272):** no new main frames at rest open. Both builds: style recalcs 39 of 40 frames (the
  panel's own animations run frames anyway), commits 39, rAF 49 vs 50, raster 11 vs 12.
- **a11y:** while hidden, #platform is out of the accessibility tree; that is only while the menu covers it
  (m >= 0.55, the panel is `aria-hidden` only below m 0.35). Its pointer-events were already `none` there.

## Pixels (PR-010, T0 asked)

Chrome, `fixes/end-morph/gates/em-px2.mjs --engine chrome --v fixes/end-morph-f12/overlay`, 430x775 DPR 3, four loads
A V A2 V2, Date frozen, animations frozen at 4 s, synthetic held touch; 18 stops: before the zone, m 0.02 ... 1 going
up, 0.5 / 0.1 / 0 coming back (`out/end-morph/px2-chrome-f12-2026-10-05T22-04-23-884Z`). Note: this run was on build
`3625c64871fa` (F1 + U2), F2 already removed.

- 17 of 18 stops: 0 css px² consistent beyond A/A (max level 0-2).
- m 0.95: **19 css px² consistent (0.0056 %), max 40, edge (flat 0)**, in both pairs: one device-pixel row along the
  bottom edge of the panel's "Join waitlist" button (css 224-304 x 560-576). Both A loads agree with each other and both
  V loads with each other. Reading (OBSERVED, cause unknown): the panel is at scale 0.998 there, and hiding #platform
  changes which layers Chrome composites under it, so the button edge is rasterized at another sub-pixel phase. That
  is a T2 difference (edge, max 40 < 128, 0.0056 % < 0.5 %), not T0. Nothing at m 0.8, 0.99, 1.
- **Lead ruling (2026-10-05):** m 0.95 is ACCEPTED as T2 (within PR-010's fill 64 / edge 128 / 0.5 % / 2,000 css px),
  provided the Simulator leg also stays within T2. The compositing cause stays OBSERVED, cause unknown.
- Gate self-test, Chrome (v9.2 against itself, same 18 stops): 0 consistent at every stop
  (`px2-chrome-selftest-2026-10-05T22-15-17-612Z`).

Simulator (fw-sim iPhone 15 Pro Max, `--engine sim`, 7 stops: pre, m 0.1 / 0.6 / 0.95 / 1 going up, 0.5 / 0 coming back):
- Self-test (`px2-sim-selftest-2026-10-05T22-48-44-833Z`): 0 consistent at every stop. Before the zone, the A/A pairs
  differ by 7 % (over 8 levels) in the photo cards under the nav. Those cards are still changing there in the Simulator.
- F1+U2 (`px2-sim-f12-2026-10-05T22-50-36-447Z`): **0 at m 0.1, 0.6, 0.95, 1 and 0.5 coming back**. m 0 coming back:
  4 css px², max 16 (fill), in the secure-network card.
- Before the zone: 73 css px² consistent, max 134, on the photo card's image under the nav. In one of the two V loads
  the next card ("Legal consult") is already in view (V/V 4.9 %). At this stop F1+U2's code path is the same as v9.2's
  (m 0, fade 1, no inline visibility; the STATE of all four loads is equal). So this reads as the noisy region the
  self-test shows, caught by chance in both V loads. That is OBSERVED. A rerun is queued (chain 4) to settle it before
  this leg is claimed within T2.

## Landing gates on v9-final (int-v8's snapshot)

- **Builds.** Both come from int-v8's read-only snapshot `out/emv9f/snap-a6426953727a/{C,V}` in its worktree (HASHES
  sha256/12 `0817a71bf0c7`):
  - C = v9-final, JS `647c9ef2b1e2`, CSS `e1359ab9994a`.
  - V = C + `delta.diff` (`befc17cec97f`) applied with `patch -F0`, JS `a6426953727a`, same CSS.
  - Every load's served hashes match.
- **U2 parity on v9-final:** int-v8, `fixes/end-morph-v9f/README.md` on its branch (75ef0eb8). PASS: 0 mismatches in
  5 cases. F1 hides #platform at the page end and shows it again at the top; desktop is untouched.

### Chrome pixels (`em-px2.mjs`, 430x775, 18 stops)

- The first run is VOID. A2's server was not accepting connections yet ("fetch failed"), so no stop was scored. The
  gate now retries that fetch and prints `GATE VOID` (exit 3) when any load fails.
- Rerun `px2-chrome-v9f-r2-2026-10-05T23-10-22-890Z`: 17 of 18 stops are 0.
- m 0.8: 19 css px² consistent, max 14, edge, along the bottom edge of the panel's Join button (css 224-320 x
  496-528). This is within T2 (edge 128, 0.5 %).
- v9-final's self-test (C against C, `px2-chrome-v9f-selftest-2026-10-05T23-04-25-842Z`, 0 consistent at every stop)
  moves the same box at m 0.8 by itself: up to 35 css px², max 44.
- On v9.2 the same edge showed up at m 0.95 instead: 19 css px², max 40, ACCEPTED as T2 by the lead.

### Chrome counts (`em-chrome.mjs --toolbar`, 430x775)

Files: `em-v9fC-775-2026-10-05T23-07-55-752Z.json` (C) and `em-v9fV-775-2026-10-05T23-08-42-190Z.json` (V). Same
phases as on v9.2; the results agree with v9.2 within a few counts. Phases not listed are equal within 6 counts.

| phase (frames) | Paint events C -> V | paint area (Mpx) | styled elements | dirty layout objects | forced style passes |
|---|---|---|---|---|---|
| open (40) | 324 -> 259 | 128 -> 126 | 1380 -> 1551 | 160 -> 184 | 62 -> 61 |
| rest open (40) | **122 -> 4** | **113 -> 9** | 383 -> 373 | 0 -> 0 | 0 -> 0 |
| close (40) | 320 -> 285 | 129 -> 126 | 1051 -> 1215 | 131 -> 155 | 76 -> 76 |
| lift + settle to open (90) | **378 -> 159** | **266 -> 130** | 1188 -> 1270 | 60 -> 84 | 34 -> 33 |
| drag close (20) | 163 -> 124 | 64 -> 61 | 404 -> 567 | 57 -> 81 | 39 -> 38 |
| toolbar step up at m 0.5 (30) | **121 -> 10** | **86 -> 12** | 335 -> 418 | 16 -> 40 | 3 -> 3 |
| toolbar step up at m 1 (30) | **85 -> 1** | **84 -> 3** | 226 -> 226 | 13 -> 13 | 3 -> 3 |
| toolbar step down at m 1 (30) | 114 -> 43 | 86 -> 42 | 322 -> 322 | 34 -> 34 | 15 -> 15 |
| still at m 1, no step (30) | 99 -> 22 | 84 -> 32 | 251 -> 251 | 0 -> 0 | 0 -> 0 |

- **Rest check:** at rest open, style recalcs are 38 vs 38 and rAF 48 vs 49. No new frames.
- **Return frame:** once per open and once per close, +164-171 styled elements and +24 dirty layout objects, as on
  v9.2.
- **Where the forced style pass lands:** on v9-final, the frame's first forced style pass is taken by another
  caller (`n`, JS line 13331, 13-25 per phase), before `_()` runs. So the F() hit tests that U2 removes no longer
  show in the forced-style attribution: 1 -> 0 per phase.
- **U2's effect:** U2 removes the per-frame F() hit tests (`getBoundingClientRect` + `elementsFromPoint`, see the
  v9.2 table). In int-v8's parity run it reported 187 / 47 deferred frames on the mobile cases, the same counts as on v9.2.

### Simulator pixels (`em-px2.mjs --engine sim`, fw-sim 15 Pro Max, Safari 26.5, 7 stops)

- Self-test, C against C (`px2-sim-v9f-selftest-2026-10-05T23-09-36-498Z`): 0 consistent at every stop. Before the
  zone, the A/A pairs differ by 0.5 % and 3.7 % over 8 levels, in the photo cards.
- F1+U2 (`px2-sim-v9f-2026-10-05T23-13-34-470Z`):
  - pre: 0 consistent (A~V 141 css px², but A2~V2 0, and the A/A pairs differ by 7.0 % there).
  - m 0.1, 0.6, 0.95, 1 and 0.5 coming back: 0.
  - m 0 coming back: **4 css px² consistent, max 16 (fill)**, in the secure-network card (css 336-384 x 128-160).
    It is the same box and size as on v9.2, and the self-test shows nothing there. So it is F1's own, OBSERVED, cause
    unknown: #platform is shown again after being hidden, and that card is re-rasterized.
  - Within T2 (fill 64, 0.5 %). Not T0.
- **Verdict on the v9-final build:** Chrome T2 (m 0.8 edge, 19 css px², max 14) and Simulator T2 (dn0 fill, 4 css
  px², max 16). Both are within PR-010's T2 numbers, with self-tested gates in both engines.

### Simulator counts (`em-sim.mjs --label v9f`, rAF scrollTo glide, 30 steps per phase, arms C / V / C)

File: `em-sim-v9f-2026-10-05T23-17-31-791Z.json`. Paint events, C / V / C again:

| phase | C | V | C again |
|---|---|---|---|
| approach | 203 | 202 | 199 |
| open | 438 | 447 | 439 |
| rest open (71-72 frames) | 48 | 43 | 49 |
| close | 399 | 403 | 399 |
| rest closed (96-97 frames) | 100 | 87 | 124 |

- Per-layer paint counts in open are equal, layer by layer (col tracks 58 / 49 / 47, #platform 32, header 32).
- V's open total is +8 over both C runs, and its style recalcs are 78 vs 60-62. That is OBSERVED, one run each, cause
  unknown; the likely cause is the hide frame's restyle (the Chrome return-frame line above).
- No gain on the glide is expected. F1's gains are at rest open and on toolbar steps, which the Simulator glide doesn't
  drive. The step-A rerun (C, V1, N; fixed script) measures toolbar strokes.

## P-152: phone no-worse check (card rev 1.1, registered before any P-152 data)

**Ticket:** P-152 (lead, 2026-10-05; registered by mgmt-clerk-1). Stage V of a less-work fix (memory
"less-work-landing-rule"): cost-card counts (above) plus one short phone no-worse check. No gain is claimed from the
phone.

**Revisions.**
- Rev 1: commit d705bdd6.
- Rev 1.1 (2026-10-06): the pre-data read (ops-reader-P152) passed with notes N1-N7. The lead signed N1 and ruled on N2-N7. This revision applies them.
- Labels:
  - This card is pre-data for P-152.
  - The prediction is informed by this build's Chrome and Simulator counts.
  - N1's calibration is informed by P-137 data from another build (P-137's C was v9-final + 7d; here C is v9-final, 7c).

**Question.** Does F1+U2 make the end-zone morph on the iPhone worse? The end-zone morph is the scroll into and out of
the end menu, with toolbar steps, driven by a real touch gesture.

**Arms (lead condition 1).**
- Both arms come from int-v8's immutable snapshot `out/emv9f/snap-a6426953727a` (HASHES.txt sha256/12
  `0817a71bf0c7`). It is copied once into `out/p152/snap`, checked against HASHES.txt, and limited to the four pinned
  files.
- C = v9-final as landed: JS `647c9ef2b1e2`, CSS `e1359ab9994a`.
- V = C + F1 + U2 (`delta.diff` `befc17cec97f`): JS `a6426953727a`, CSS `e1359ab9994a`.
- B = the plain baseline, used only for the thermal gate's timer page.
- Served by `phone/p152-serve.sh` (int-v8's serve.sh, copied): plain http, `--vendors=local --latency 150`.
- Both arms' served JS and CSS are hashed before every run. A mismatch voids the hold.

**Driver and profile (lead condition 2).**
- Driver G: `iphone.mjs gesture` with fs = `fixes/morph-scroll/g-fastshort-v1.json`, compiled program
  `8737f212c0ff`, E procedure (first touch 4.0-5.5 s after page ready). This is the same script as P-137 and T-194.
  Its swipes run to the page bottom and back, through the morph's open and close, with Safari toolbar steps.
- Hold time comes from `gesture --dry-run`'s `GESTURE_BUDGET_S`; a time guard re-runs a hold whole.
- Heat profile `xcode-serious`: Xcode Device Conditions only, never thermal.mjs. A thermal gate runs at each phone
  hold's edges (`--expect serious --max-c 44 --accept-induced`).

**Plan.**
- One uncounted warm-up per arm (WC, WV).
- Sentinels S0 (start) and S1 (end) are Timeline-OFF runs on C, judged by the signed P-129 sentinel rule (moving fps
  >= 50, slow share <= 6 %). S0 FAIL voids the block. S1 FAIL voids every counted run.
- 8 counted runs, Timeline on, in the order C V V C C V V C (EC1, EV1, EV2, EC2, EC3, EV3, EV4, EC4).
- Each counted run must pass the P-129 run gates G1-G6. A failed run is re-run once in the tail, at most 2 re-runs per
  block.
- A re-run counts only when the first try is INVALID by `readRun`. If the runner flagged a first try only for a non-zero gesture exit, and it is valid by `readRun`, it still counts and its re-run is ignored (N5).
- At most 2 blocks. Block 2 runs only after a block-1 FAIL and the lead's go (N2):
  - Before block 2, `TICKET=P-152 sh fixes/end-morph-f12/phone/p152-block.sh ARCHIVE-BLOCK1` moves `out/p152/runs`, the hold logs, the WDA logs and `serve-check.log` to `out/p152/block1/`, then restarts the three servers (§5.1).
  - Block 2 is judged by itself with the same rule. It is never pooled with block 1.
- Part 2's end gate (N3): part 2's end thermal gate runs only in HA, after the attribution runs. An HA end-gate failure (over 44 °C, or not Serious), or a missing `hold-HA.log`, voids part 2's counted runs: EC2, EC3, EV3, EV4, EC4 and every re-run. `p152-read.mjs` reads `hold-HA.log` and lists those runs as INVALID "part 2 end gate".

| part | holds (each a 600 s chrome-measure `--no-timing` hold, 2 runs at most) |
|---|---|
| 1 | H1 WC WV, H2 S0 EC1, H3 EV1 EV2 |
| 2 | H4 EC2 EC3, H5 EV3 EV4, H6 EC4, H7 TAIL (re-runs, then S1), HA AC1 AV1 |

**Runner steps (lead condition 6).**
- `p152-block.sh` starts every part with `iphone.mjs wda stop`, `wda start`, `wda check` (the I-212 lesson), and stops
  the part if WDA is not READY. Each hold also runs `wda check` before its start gate.
- Safari is parked after every run. `p152-block.sh` also parks it on every exit of a part through an EXIT trap, including a BLOCK STOP on a failed hold or gate (N4).
- Every part starts with `p152-serve.sh check` and appends its output to `out/p152/serve-check.log`: B, C and V's served JS and CSS hashes, with B `4606120cf392` / `27776f3d4138`. A failed check stops the part before anything runs (N6).
- The block mark is `lock.mjs run iphone --block P-152 --max-seconds 3600`. After each hold: `doing iphone
  --between 1`.
- Commands (the runner, in the background, after `sh fixes/end-morph-f12/phone/p152-serve.sh start`):
  `TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- sh
  fixes/end-morph-f12/phone/p152-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2`, then the same with
  `H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1`. Before the read, VOID holds' records are moved to
  `out/p152/void/<H>/`.

**Metric** (`phone/p152-read.mjs`):
- Per counted run, the signed P-129 reader rev 1.1 (`readRun`, role E) gives the moving frames.
- The end zone is the reader's lastScreen band: scrollY >= maxY - innerHeight. On v9-final the morph track is the last
  innerHeight of the scroll (Chrome: endStart 5189 = max 5964 - 775, OBSERVED), so this band is m >= 0.
- n = moving end-zone frames; s(th) = those with dt > th, for th 30, 34, 38, 46, 50, 54.
- P-137's after-touchend subset is reported but decides nothing.
- Per run, the read also reports the near-band counts (N5): (30, 38] = s30 - s38 and (46, 54] = s46 - s54.

**Decision (lead condition 3, rev 1.1: N1 signed by the lead, 2026-10-06).** V is judged against C, at >34 and at >50 separately.
- WORSE when EITHER:
  - (a) min(V) > max(C); OR
  - (b) median(V) - median(C) > +2 at >34, or > +1 at >50, AND an exact one-sided permutation p <= 0.05.
- How p is computed. The statistic is the MEAN difference, as in P-150 rev 1.3 (lead, 2026-10-06). `permP` is copied from fix-end-bg's `fixes/end-bg/phone/p150-read.mjs` at 753366c1.
  - p is the share of all C(nC + nV, nV) relabelings of the valid runs, into the arms' sizes, whose mean(V') - mean(C') is >= the observed difference.
  - The observed labelling is included. Ties count against V, that is, in the numerator.
  - At 4 v 4 the observed split must be among the top 3 of 70.
- The smallest p, reached at full separation, depends on the run counts:

  | runs (C v V) | relabelings | smallest p | can clause (b) fire? |
  |---|---|---|---|
  | 4 v 4 | 70 | 1/70 | yes |
  | 3 v 4 | 35 | 1/35 | yes |
  | 3 v 3 | 20 | 0.05 | only at full separation, where (a) fires anyway |
- Rates are used instead of counts when median n differs by more than 15 % between the arms. The bounds then become 2 and 1 divided by median n(C), and p is computed on the rates the same way.
- Twins: >30 and >38 use the >34 bound and test; >46 and >54 use the >50 bound and test. A twin that disagrees with its main threshold marks the result "threshold-sensitive".
- Precedence (N5): VOID > INSUFFICIENT > FAIL / NO-WORSE PASS.
  - VOID: a sentinel failed or is missing.
  - INSUFFICIENT: an arm has fewer than 3 valid runs.
  - NO-WORSE PASS: neither >34 nor >50 is WORSE.
  - FAIL: either is WORSE; it goes to the lead (block 2, judged by itself, or no landing).
- Reported, deciding nothing: thresholds whose median bound is exceeded while p > 0.05. Rev 1 would have failed these.
- "Position-confounded" is added when the lowest V run at a failing threshold opens its hold (EV1, EV3). It is a label only and doesn't change the outcome.
- EC1 slot (N7, descriptive): the read states whether EC1 is again C's maximum at >34 and >50. In P-137, EC1 (H2, right after S0) was C's maximum at both thresholds: 40 against 25-29, and 15 against 1-5. That is OBSERVED, and on another base (P-137's C was v9-final + 7d; here it is 7c). In the same slot here, EC1 would favour V.
- The scorer's self-test (`node fixes/end-morph-f12/phone/p152-read.mjs --selftest`, 30 checks) covers:
  - each clause alone and both together, at both thresholds, including clause (b) with p <= 0.05 and the median bound alone with p > 0.05 (a pass);
  - the lead's three cases: an A/A of P-137's C runs against a relabeled copy (PASS), P-137 as recorded (PASS), and P-137 with its arms swapped, +21 / +3.5 (FAIL);
  - `permP` on P-150 rev 1.3's own cases (4 v 4 at 2/70; 3 v 3 at full separation and with a boundary tie), at 3 v 4, and with all values tied;
  - the 3-run floor for each arm, the rates switch, the twin flag, the position label, the end-zone filter and the attribution split.

**Falsification line (lead condition 4).**
- Prediction: NO-WORSE PASS, with p = 0.85 (N5). F1 hides #platform only at m >= 0.55, where it is already at opacity 0, and U2 removes hit tests. The 0.15 covers two things:
  - the rule's false FAIL rate with no real effect, 3-5 % at 4 v 4 (power note);
  - the named risk below.
- The named risk: F1's return-frame restyle could add a slow frame at each open and close. That restyle is +164-171
  styled elements and +24 dirty layout objects in Chrome, and Simulator style recalcs went 78 against 60-62 in open.
  If it does, it shows at >34 or >50 as a median rise of 1-2 or more per run, since each run has several opens and closes. At 4 v 4, the rule catches a rise that small only by separation, or when p <= 0.05 (power note). A small regression can therefore pass, and the card says so.
- A FAIL means the fix does not land as is. The next step would then be a version that keeps #platform hidden without
  the restyle (for example, hiding only #platform's composited children).

**Attribution (lead condition 5; decides nothing).**
- AC1 and AV1 run after S1, Timeline on.
- Read: Paint records per moving frame, split at m >= 0.55 (F1's range) and 0 <= m < 0.55, with m from scrollY and
  innerHeight (Chrome geometry; an approximation on the phone).
- Expectation: fewer Paint records per frame at m >= 0.55 on V, from the toolbar-step repaints of #platform that P-137
  showed. Never a gate.

**Power note (OBSERVED; disclosed per the lead's N1 ruling).**
- P-137's C arm (v9-final + 7d, same script and profile, 4 runs) had 25-40 end-zone frames over 34 ms per run and 1-15 over 50 ms.
- The pre-data read resampled 4 v 4 blocks from those runs. I re-checked it with this reader's rev 1.1 code, using the mean statistic. Each row is 4000 draws; runs are drawn with replacement, without and with a uniform ±2 added to each count:

  | V shifted by (>34 / >50) | FAIL, rev 1 rule (bound only) | FAIL, rev 1.1 rule (bound and p) |
  |---|---|---|
  | none (V = C) | 37-41 % | 3.2-5.2 % |
  | +6 / +2 | 79 % | 34 % |
  | +10 / +3 | 92-93 % | 44-46 % |

- The reader's numbers were: false FAIL 37-52 % under rev 1 and 3-7 % under rev 1.1; catch rate about 26-34 % at +6 / +2 and 44 % at +10 / +3.
- So at 4 v 4 and this noise, a PASS does not rule out a regression of a few frames per run. It says no large one showed.
- These numbers come from another build (7d), read OBSERVED.

**Addendum D1-D3, rev 1.2 (lead, 2026-10-06 ~23:58Z and ~00:00Z: "D1+D2 as proposed").** The rev 1.1 delta check (ops-reader-P152) passed with notes D1-D3.
- Written before any part-1 or part-2 data: part 1's first try stopped at H1's start gate with no run (see "Block log" below).
- Rev 1.2 changes:
  - `p152-read.mjs` now applies D1 itself (`part2Status`, 8 new self-test checks).
  - A new `p152-endgate.sh` runs the standalone end gate.
  - The part-2 command runs `p152-endgate.sh` after `p152-block.sh` in the same phone hold.
  - `p152-block.sh`, `p152-hold.sh` and `p152-serve.sh` are unchanged.
- **D1, part 2's end gate.** Part 2's counted runs (EC2, EC3, EV3, EV4, EC4 and every re-run) count only when one of these holds:
  - `out/p152/hold-HA.log` ends with "HOLD HA VALID"; or
  - HA stopped before its end gate ran, and a standalone end gate then ran and passed. The cases are exit 4 (served hash or open failed), exit 5 (WDA) and exit 7 (the time guard twice).
  - The standalone gate runs right after the stop, in the same phone hold, and is logged to `out/p152/end-gate-after-HA.log`: `node research/phone-thermal-gate/thermal-gate.mjs --owner iphone-runner --label p152-HA-end-standalone --expect serious --max-c 44 --accept-induced --url <B's LAN URL from tools/lan.mjs>`.
  - Otherwise part 2 is VOID.
  - Rev 1.2's reader applies this rule (`part2Status`): the last "HOLD HA" line decides, and the standalone gate's last "ENDGATE PASS|FAIL" line.
  - Part-2 command (rev 1.2; the Safari restart first is I-214's workaround, lead 2026-10-06; it is uncounted and
    runs before the part's WDA restart, as the successful part-1 retry did by hand):

    ```
    TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- \
      sh -c 'node tools/iphone.mjs safari-restart --owner iphone-runner --url "$(node tools/lan.mjs --url --port <B port, from out/p152/serve-B.json>)" --timeout 60; sh fixes/end-morph-f12/phone/p152-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1; e=$?; sh fixes/end-morph-f12/phone/p152-endgate.sh; exit $e'
    ```

    `p152-endgate.sh` does nothing when HA ended VALID, when HA's own end gate ran, or when `hold-HA.log` is missing.
- **D2, block 2 after a VOID.** A block-1 VOID (a sentinel fails) is archived with `ARCHIVE-BLOCK1`, like a FAIL, and counts as one of the 2 blocks.
- **D3, the PIN line.** The first real PIN line must show `p152-read.mjs=adf4e7a27122`. The rev 1.1 dry run printed an older hash, because the reader changed after it; that is harmless.

**Kit (pins, sha256/12, at the rev 1.2 commit; rev 1 pins: block `3a2d0a7716c7`, hold `b5b38c853340`, serve
`2548d4588b0e`, read `005136ea3002`).** Rev 1.1 changes `p152-block.sh` (N2, N4, N6) and `p152-read.mjs` (N1, N3, N5, N7). It does not change `p152-hold.sh` or `p152-serve.sh`.

| file | pin |
|---|---|
| `phone/p152-block.sh` | `d2d8e37c419d` |
| `phone/p152-hold.sh` | `b5b38c853340` |
| `phone/p152-serve.sh` | `2548d4588b0e` |
| `phone/p152-read.mjs` | `597bd8bd9e30` (rev 1.2; rev 1.1 `adf4e7a27122`) |
| `phone/p152-endgate.sh` | `04c156f84403` (new in rev 1.2) |

- Dependencies, signed and unchanged: `research/serious-heat/phone/p129-gates.mjs` `a06847c64a2e` and
  `research/serious-heat/p129-read.mjs` `06f74f5d19ca`.
- The runner prints these pins and the other dependencies (fs script, thermal gate, pmcheck, the snapshot files) in
  every hold's PIN line.
- Dry run (2026-10-05 23:27Z, servers up): `P152_DRY=1 TICKET=P-152 sh fixes/end-morph-f12/phone/p152-block.sh H1:WC,WV
  H2:S0,EC1 H3:EV1,EV2 H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1`.
  - Every hold: DRY ok.
  - Served hashes: C `647c9ef2b1e2`, V `a6426953727a`, CSS `e1359ab9994a`; B `4606120cf392` / `27776f3d4138`.
  - Compiled program `8737f212c0ff`, GESTURE_BUDGET_S 229.
  - Thermal gates at start (H1) and end (HA); TAIL resolved to S1 alone.
  - The servers were stopped afterwards.
- Rev 1.1 dry run (2026-10-05 23:49Z, servers up), same command:
  - Every hold: DRY ok.
  - The part-start serve check was logged in `out/p152/serve-check.log`: B, C and V all ok, B `4606120cf392` / `27776f3d4138`.
  - Gates at H1 (start) and HA (end); TAIL resolved to S1.
- `ARCHIVE-BLOCK1` tested on the dry-run files:
  - It moved `runs/`, the hold logs and `serve-check.log` into `out/p152/block1/` and restarted the servers (hashes ok).
  - A second call refused (exit 2).
  - The test archive was then renamed `out/p152/dry-archive-test-1`, so a real ARCHIVE is not refused, and the servers were stopped.
- What the dry runs did NOT exercise (N6): WDA stop/start/check, the thermal gates, `iphone.mjs park` (the EXIT trap is off in dry mode), and TAIL re-runs (none were needed). They run for the first time in the real block.
- Reader smoke test (rev 1.1), on P-137's records:
  - Without a `hold-HA.log` next to the runs folder, part 2's runs read as INVALID "part 2 end gate" and the decision is INSUFFICIENT, as specified.
  - With a passing `hold-HA.log` fixture, all 8 runs count. The result is NO-WORSE PASS (p 70/70 at >34 and >50), and the EC1 slot lines say yes at both thresholds.
- Reader smoke test (rev 1): on P-137's own records (fix-end-bg's out/p137/runs: a different question, used only to test
  parsing), the reader read all 8 counted runs and both sentinels, and the attribution read gave plausible splits
  (EC1: 719 frames at m >= 0.55, 675 below).

## P-152 block log

- 2026-10-05 23:55Z, part 1, first try:
  - The serve check was ok and WDA restarted READY.
  - H1's PIN line showed block `d2d8e37c419d` and read `adf4e7a27122` (D3 met for rev 1.1).
  - H1's start gate read state Serious, induced Yes, battery 35.3 °C. Its timer part then failed: `iphone.mjs open` exit 1, so the gate exited 1, the hold was VOID with no run, BLOCK STOP exit 5, and Safari was parked by the EXIT trap.
- Cause: after the reconnect and the WDA restart, Safari's parked tab did not answer `Runtime.evaluate` (5 timeouts), and `open` ended BLOCKED instead of restarting Safari. Incident I-214.
- Workaround: `iphone.mjs safari-restart --url <B>` succeeded at 00:01Z, in a short phone hold with no counted run.
- No run, counted or not, came from the first try. Part 1 restarts from H1 in the same block; the old hold-H1 log is moved aside by the driver.

## Pending

- Done: the v9.2 Simulator pixel rerun before the zone and the step A rerun (both in `fixes/end-morph/README.md` section 5).
- P-152, the phone no-worse check (less-work rule):
  - Rev 1.1 waits for the lead's delta check and signature, then runs through the phone (reconnected, WDA ready).
  - Phone servers: `phone/p152-serve.sh`, on the copy of int-v8's snapshot.
