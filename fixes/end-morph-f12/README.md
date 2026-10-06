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
- Rev 1.2 (fc7d5a90, 2026-10-06): addendum D1-D3, see below.
- Rev 1.3 (2026-10-06): block 1 stopped at H3's end gate (Critical, 43.0 °C). The lead voided it as a whole and archived it as block 1 of 2. These heat rules apply to block 2, the last block (see "Rev 1.3: heat rules"):
  - every hold runs a start and an end thermal gate;
  - a logged cooling gap whenever a hold ends at 41.5 °C or above;
  - at most two counted runs in one hold;
  - block 2 starts only after the phone cools below 38 °C.
- Rev 1.4 (2026-10-06, after P-153 block 1 went VOID at 04:07Z: H2's end gate read Critical at 41.9 °C, from 39.3 °C, after S0 and EC1). The lead's new heat rules, mirrored from P-153 (see "Rev 1.4: one item per hold"):
  - cool below 38 °C before EVERY hold, then the WDA check;
  - at most 1 counted run per hold; warm-ups, sentinels and attribution runs each in their own hold;
  - the end-gate Critical rule stays; the run order and the balance stay, only the holds split.
  - Written before any block-2 data (block 2's 03:18Z attempt stopped before any run).
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
- Part 2's end gate (N3; superseded by rev 1.3): rev 1.1-1.2 gated each phone hold only at its edges, so part 2's end gate ran only in HA, and an HA failure or a missing hold-HA.log voided part 2. Rev 1.3 gates every hold, and each counted run is judged by its own hold (below).

| part | holds (rev 1.4: each a 600 s chrome-measure `--no-timing` hold with ONE item, after cooling below 38 °C, with a start and an end thermal gate) |
|---|---|
| 1 | H1 WC, H2 WV, H3 S0, H4 EC1 |
| 2 | H5 EV1, H6 EV2, H7 EC2 |
| 3 | H8 EC3, H9 EV3, H10 EV4 |
| 4 | H11 EC4, H12 TAIL (each re-run in its own hold, H12-H13, then S1 in the next), H15 AC1, H16 AV1 |

Rev 1-1.3 plan, for the record: part 1 H1 WC WV, H2 S0 EC1, H3 EV1 EV2; part 2 H4 EC2 EC3, H5 EV3 EV4, H6 EC4, H7 TAIL, HA AC1 AV1.

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
- The scorer's self-test (`node fixes/end-morph-f12/phone/p152-read.mjs --selftest`; 30 checks in rev 1.1, 38 from rev 1.2, the 8 rev 1.2 D1 checks replaced in rev 1.3 by 8 per-hold validity checks) covers:
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

**Rev 1.3: heat rules (lead ruling after block 1 stopped, 2026-10-06 ~00:24Z).**
- **Block 1 is VOID as a whole.** A failed gate voids every run since the last passing gate. The last passing gate was H1's start gate (H2 had no gates), so EC1, EV1 and EV2 are void. S0 passing doesn't rescue them: it is a frame-rate control, not a heat gate. Nothing was scored.
- Block 1 was archived with `ARCHIVE-BLOCK1` into `out/p152/block1/`. It counts as 1 of the 2 blocks (D2), so block 2 is the last.
- **Heat curve, OBSERVED (block 1, profile xcode-serious, driver G):**
  - The battery went from 36.1 °C at H1's start gate (00:04Z) to 43.0 °C at H3's end gate (00:22Z): +6.9 °C in 18 min, over 2 warm-ups, 1 sentinel and 3 counted runs.
  - The state read Critical with "induced Yes" (the Xcode Device Conditions setting is Serious). Whether real heat or Xcode raised it to Critical is UNRESOLVED.
  - Cooling afterwards (phone idle, parked): 42.6 °C at 00:25Z, 42.1, 41.5, 40.8 at 00:28Z, about 0.6 °C per minute.
- **(a) Gates on every hold.** Every hold runs a start and an end gate (`P152_GATE=both`). An end-gate FAIL voids only that hold's runs, and the block stops. `p152-read.mjs` judges each counted run and sentinel by the hold that ran it: it counts only when that hold's log ends "HOLD <H> VALID". This supersedes N3 and D1, and `p152-endgate.sh` is no longer used.
- **(b) Cooling gap.** After each hold but the part's last: when that hold's end gate read the battery at 41.5 °C or above, the driver runs `wait.mjs phone-temp --below 40 --timeout 600`, logged in `out/p152/cooling.log`.
  - Under xcode-serious this is a ceiling guard, not a heat-profile change. It is disclosed: the runs after a gap start cooler than those before it.
  - A timeout is logged, and the next hold's start gate decides.
- **(c) At most two counted runs per hold.** The driver refuses a plan that breaks this before anything runs. The plan already meets it.
- **(d) Block 2 starts cool.**
  - Part 1 runs with `P152_COOL_FIRST=38`: `wait.mjs phone-temp --below 38 --timeout 900` runs first, logged; a timeout stops the part (exit 6).
  - Then H1's start gate must read Serious with induced Yes. If it reads Critical at 38 °C or below, the block stops (start gate FAIL), and the runner tells the lead: the Xcode condition may need a restart by the user, through a console step the lead posts.
- I-214: every part restarts Safari with the timer page after its WDA restart (`iphone.mjs safari-restart`; exit 5 if it fails).
- **Auto-lock lesson (I-215, OBSERVED, cause unconfirmed).** On block 2's first part start, after about 10 min of idle cooling with Safari parked, WDA would not start: "Timed out while enabling automation mode" at 00:36Z, and again on one retry. The phone most likely auto-locked during the wait.
  - Long cooling waits can let the phone lock, so the runner checks WDA right after any cooling wait. The kit already does this:
    - after `P152_COOL_FIRST`, the part's WDA restart and check come next (exit 5 on failure, before any gate or run);
    - after a mid-part cooling gap, the next hold runs `iphone.mjs wda check` before its start gate (hold VOID exit 5, no run).
  - A failed check stops the part with nothing used up.
  - Remedy (lead, console step C-071): the user unlocks the iPhone and sets Auto-Lock to Never for blocks.
  - Block 2 was unused by both failures: no gate and no run happened.
- Block 2 commands, the runner's, in the background, after the servers are up (`ARCHIVE-BLOCK1` restarted them):
  - `TICKET=P-152 P152_COOL_FIRST=38 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 --keep 120 -- sh fixes/end-morph-f12/phone/p152-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2`
  - then `TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- sh fixes/end-morph-f12/phone/p152-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1`.
- Time per hold: a gate takes about 30 s, so two gates plus two runs (budget 229 s each; real runs took about 130 s) fit one 600 s hold. The time guard still applies.

**Rev 1.4: one item per hold (lead ruling after P-153 block 1 went VOID, 2026-10-06 ~04:10Z).**
- Why: P-153's block 1 hit the same wall as P-152's block 1. Its H2 end gate read Critical at 41.9 °C after S0 and EC1, from 39.3 °C at H1 (OBSERVED, same phone, same profile). Two runs in one hold heat the phone past the ceiling.
- **(e) Cooling before every hold.** `p152-block.sh` runs `wait.mjs phone-temp --below 38 --timeout 900` before each hold (logged in `out/p152/cooling.log`); a timeout stops the part (exit 6). Right after the cooling: `iphone.mjs wda check`; if WDA is not READY, one WDA restart (stop/start/check) and a Safari restart (I-214); still not ready: the part stops (exit 5), nothing used up. This supersedes rev 1.3 (b) (the gap only after a hold at 41.5 °C or above) and (d) (`P152_COOL_FIRST`, now ignored with a NOTE).
- **(f) One item per hold.** At most 1 counted run per hold, and each warm-up, sentinel and attribution run in its own hold. The driver refuses any other plan before anything runs (tested: `H1:WC,WV` refused, exit 2). TAIL puts each re-run in its own hold, then S1 in the next; its re-run scan reads every `hold-H*.log` of the block in hold order.
- Unchanged: the end-gate Critical rule (rev 1.3 (a): an end-gate FAIL voids that hold's runs and the block stops), the start gate (Serious, induced Yes), the run order C V V C C V V C, 4 v 4, the decision rule and the reader's per-hold validity (`holdStatus`; hold names now H1-H16, one new self-test check, 39 in all).
- Disclosed: every run now starts below 38 °C after a cooling wait, so the runs are cooler and further apart than in P-137 or block 1. Both arms get the same treatment, in the same order.
- The "position-confounded" label (P-150 N3, descriptive) stays as signed (lead ruling at the rev 1.4 signature). Disclosed: with one run per hold it marks only the EV1/EV3 slot (the first V run of parts 2 and 3), not a position inside a hold.
- Signed by the lead at ~04:2xZ, 2026-10-06 (b6914cda): the kit diff matches the ruling; tools, tests, .claude and site unchanged against main; pins on disk equal the commit; SELFTEST ok (39), re-run by the lead; out/p152/runs empty. The single 900 s cooling timeout is accepted. No kit change to align with P-153's diff unless a defect is found (any change needs a new delta check).
- Rev 1.4 kit change after the signature (lead ruling 2026-10-06, from P-153 block 2's lessons, before any block-2 data):
  - `prehold()` parks Safari (`iphone.mjs park --owner "$R"`) before every cooling wait, the same line as P-153's kit 52642af6. In P-153 a hold's end gate left B's timer page open and the phone warmed 39.0 → 40.2 °C in a 600 s wait; parked, it cooled in 3-6 min. Each hold opens its own page in its start gate, so no counted run changes. A failed park is logged and the wait goes on.
  - Block pin 7e98087e3988 → a60e0c9fe0a6; hold, read and serve unchanged. Dry part 1 DRY ok for every hold (logs in `out/p152/pre-block2-r15/`); SELFTEST ok (39); out/p152 has no hold logs and runs/ is empty.
  - Each part starts with Bash `run_in_background` and `timeout: 7200000` (2 h). The 30-min default killed P-153 part 1 at 1800 s.
- Time: each hold is cooling (0-15 min), a WDA check, two gates (about 30 s each) and one run (budget 229 s). Four phone holds of 3-4 holds each may pass 3600 s (OVERDUE, never killed).
- Commands (the runner's, in the background, after `p152-serve.sh start`):
  - `TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 --keep 120 -- sh fixes/end-morph-f12/phone/p152-block.sh H1:WC H2:WV H3:S0 H4:EC1`
  - then `... p152-block.sh H5:EV1 H6:EV2 H7:EC2`, then `... H8:EC3 H9:EV3 H10:EV4`, then `... H11:EC4 H12:TAIL H15:AC1 H16:AV1`.
- Dry runs (2026-10-06 ~04:20Z, servers up, `P152_DRY=1`): part 1 `H1:WC H2:WV H3:S0 H4:EC1`, every hold DRY ok; part 4 with fixture hold logs naming EV2 (H6) and EC3 (H9) as RERUN-NEEDED: TAIL ran H12 EV2r, H13 EC3r, H14 S1, then H15 AC1, H16 AV1, all DRY ok. Cooling and the WDA check are skipped in dry mode (PREHOLD lines). The dry logs, the fixtures and the 03:18Z attempt's H1 log were then moved to `out/p152/pre-block2-r14/`, so block 2 starts with no hold logs.
- The reader header's two dropped paragraphs (twins, position-confounded; the rev 1.3 doc gap below) are back, with this revision's re-pin.

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

**Kit (pins, sha256/12, at the rev 1.4 commit; rev 1 pins: block `3a2d0a7716c7`, hold `b5b38c853340`, serve
`2548d4588b0e`, read `005136ea3002`).** Rev 1.1 changes `p152-block.sh` (N2, N4, N6) and `p152-read.mjs` (N1, N3, N5, N7). Rev 1.4 changes `p152-block.sh` ((e), (f)), `p152-read.mjs` (labels, header, one self-test check) and `p152-hold.sh` (header plan comment only).

| file | pin |
|---|---|
| `phone/p152-block.sh` | `a60e0c9fe0a6` (rev 1.4 + park before cooling; rev 1.4 as signed `7e98087e3988`; rev 1.3 `4b8c70324a81`, rev 1.1-1.2 `d2d8e37c419d`) |
| `phone/p152-hold.sh` | `e48dd4563c45` (rev 1.4, comment only; rev 1-1.3 `b5b38c853340`) |
| `phone/p152-serve.sh` | `2548d4588b0e` |
| `phone/p152-read.mjs` | `74ffb1031287` (rev 1.4; rev 1.3 `11ab8b9496b0`, rev 1.2 `597bd8bd9e30`, rev 1.1 `adf4e7a27122`) |
| `phone/p152-endgate.sh` | `04c156f84403` (rev 1.2; not used from rev 1.3) |

- Doc gap in `p152-read.mjs` rev 1.3 (`11ab8b9496b0`), found by fix-end-morph-p1 on 2026-10-06; comment only, no code effect.
  - The rev 1.3 edit also deleted the header's two comment lines on twins ("threshold-sensitive") and "position-confounded".
  - The code applied both rules exactly as this card's Decision section states throughout.
  - Restored in rev 1.4 (re-pinned anyway for the new heat rules).
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

- 2026-10-06 00:04-00:22Z, part 1 retry: H1 VALID (start gate PASS, 36.1 °C), H2 VALID (S0 PASS, fps 55.5; EC1 gates ok), H3: EV1 and EV2 gates ok, then the end gate FAILed the ceiling (Critical, 43.0 °C), so H3 is VOID and the block stopped. Safari was parked.
- Lead ruling (~00:24Z): block 1 is VOID as a whole (no passing gate after H1's start). It was archived with `ARCHIVE-BLOCK1` at 00:25Z and is 1 of 2 blocks. Cooling to 38 °C started at 00:25Z, in its own phone hold, logged in `out/p152/cooling.log`.
- 00:39Z onward: the WDA restart after cooling timed out twice. The phone had likely auto-locked (I-215). The lead posted console step C-071 (unlock, Auto-Lock Never), done at 03:17Z.
- Block 2 attempt at 03:18Z: H1 start gate Critical at 35.29 °C, induced Yes, VOID before any run; not counted (lead ruling).
  - The serve check was ok, cooling was skipped (below 38 °C), and WDA and Safari restarted. No warm-up and no counted run. Safari was parked by the EXIT trap.
  - Cause (OBSERVED): a cool phone reading Critical with induced Yes points at the Xcode Device Condition. The lead posted C-072 (stop the condition, wait 2 min, start Thermal State Serious). Part 1 reruns when C-072 is done; its start gate must read Serious, and a second Critical stops the block with no retry.

- 2026-10-06 07:07-08:49Z, **block 2 (rev 1.4 + park, block pin a60e0c9fe0a6), complete: 14 of 14 holds VALID.**
  - Part 1 07:07-07:32Z (after C-079), part 2 07:33-07:53Z, part 3 07:54-08:14Z: H1-H10 VALID. Every gate read Serious with induced Yes, battery 34.89-38.59 °C, none Critical. Before every hold: Safari parked, cooling met at once, WDA ready.
  - Part 4, first start 08:15Z: the part-start WDA restart failed (automation-mode timeout, BUILD INTERRUPTED), exit 5, before any hold or gate; nothing counted lost (incident I-220, lead). The log is `out/p152/block2-r15-part4-stop0815.log`.
  - Part 4 rerun 08:26-08:49Z (after the C-082 re-plug): H11 EC4, H12 S1 (TAIL: no re-runs), H15 AC1, H16 AV1 VALID. The phone went to the user (T-214) at 08:49:37Z with no keep.
  - EC4 ran after a 1052 s gap at 34.79 °C (the re-plug pause); the other counted runs had 362-507 s gaps at 36.89-37.69 °C.
- **Read (p152-read.mjs pin 74ffb1031287, on out/p152/runs; `results-p152.json`): DECISION FAIL, V WORSE than C, threshold-sensitive.**
  - Sentinels: S0 PASS (fps 55.4, slow 0.031), S1 PASS (fps 54.9, slow 0.037).
  - End zone, per run, frames dt>34 / dt>50: C 28/1, 30/4, 36/8, 35/3; V 76/24, 42/4, 58/14, 40/10. Median V-C: >34 +17.5 (p 1/70, separated), >50 +8.5 (p 3/70); both bounds exceeded, so WORSE at both registered thresholds. Twins: >30 +15.5 (p 5/70), >38 +15, >46 +9.5 (p 3/70), >54 +5.5 (p 4/70).
  - Disclosed as signed: EV1 and EV3 are the "position-confounded" slot (the first V run of parts 2 and 3), and they carry the two largest V counts (76/24 and 58/14). The other two V runs (42/4, 40/10) are also above every C run at >34, and at or above C's median at >50, so the slot does not explain the whole gap (descriptive, decides nothing).
  - Attribution (decides nothing): paints per frame AC1 11.74 (m high) / 11.18 (low), AV1 11.71 / 11.11; the less-work saving seen in Chrome and the Simulator does not show as fewer paints here.
  - The phone no-worse check is not met as registered. The lead rules on the next step; this is block 2 of 2 for P-152.

### P-152: where V's extra slow frames are, and the suspected cause (after the read; exploratory, decides nothing)

Written at the lead's request while ops-reader-P152 recomputes the read. Same records (out/p152/runs), no phone; scripts in
the scratchpad (`p152-mbins.mjs`, `p152-tltypes.mjs`), not committed. m is the reader's morph value (track = innerHeight,
an approximation on the phone). OBSERVED in our setup.

Slow end-zone frames (dt > 34), per counted run, by m:

| m range | C (EC1-EC4) | V (EV1-EV4) |
|---|---|---|
| 0 to 0.2 (U2's range) | 10 / 10 / 12 / 11 | 16 / 10 / 11 / 10 |
| 0.2 to 0.55 | 10 / 10 / 11 / 15 | **35 / 29 / 30 / 21** |
| 0.55 to 1 (#platform hidden in V) | 8 / 10 / 13 / 9 | 25 / 3 / 17 / 9 |
| frames that cross m 0.55 | 0-2 | 1-3 |

- The gap is in 0.2 <= m < 0.55: all four V runs are above every C run (separated). At m < 0.2, where U2 acts, the arms
  are the same. At m >= 0.55 V is mixed (EV1 and EV3 high, EV2 and EV4 at or below C). The crossing frame itself
  (F1's one-off hide or show) holds only 1-3 slow frames per run.
- In 0.2 <= m < 0.55 it is the **closing direction**: going down, dt > 34 is C 6 / 3 / 5 / 7 and V 23 / 21 / 21 / 14
  (separated); going up, C 4 / 7 / 6 / 8 and V 12 / 8 / 9 / 7 (overlapping). Closing through this range is the first
  stretch after F1 removes `visibility: hidden` (m < 0.55) and #platform fades back in (`--morph-fade` > 0).
- **The main thread does less there in V, not more.** Timeline records summed over those closing frames (all four
  runs per arm; C 1080 frames, V 1027): Layout 904 -> 759 ms, Paint 588 -> 499 ms, scripts (FunctionCall) 845 ->
  524 ms, Composite (WebKit's layer flush) 11234 -> 9639 ms; RenderingFrame totals equal (20257 vs 20339 ms). So the
  extra time sits outside what Web Inspector's Timeline records for the page: the UI-process side, i.e. the Core
  Animation commit and rasterization of the layers that come back.

**Suspected cause (UNRESOLVED): F1's re-show, not U2.** When #platform loses `visibility: hidden` on the way down, its
composited parts (stage artboard, secure-network parts, the tiles) come back, and the frames that follow pay to
rebuild them outside the page's main thread, while the section fades in. In C these layers never left: the section
was only at opacity 0. In Chrome the same return frame showed one restyle of the subtree (+150 elements, +24 layout
objects) and one repaint, all on the main thread (cost card above). On the phone the cost is spread over several
frames and is not on the main thread, so the cost card could not show it. Not layout (less in V), not paint counts (equal per frame in
AC1 and AV1), not U2 (its range is clean, and it removes work).

- What would decide it: an F1-only vs U2-only split on the phone (one block, same C), or an Instruments Core Animation
  trace of the closing stretch on the phone (commit and render-server time per frame), C vs V. Both need the phone and
  the lead's slot.
- What it suggests if confirmed: land U2 alone (its range shows no cost, and it only removes work), or move F1's
  re-show off the fade frames. One option is to un-hide #platform at a higher m while the panel still covers it
  fully, so the layers are back before the fade-in. That is a new variant and needs its own cost card, pixels and
  phone check.

## Split block (DRAFT ticket, for the lead to sign or drop with the F1+U2 ruling; written before any data)

**Question:** is F1 or U2 behind V's extra slow frames on the way down at 0.2 <= m < 0.55 in P-152 block 2?
The suspect is F1, which un-hides #platform as its fade-in starts. U2 is not suspected.

**Arms** (immutable copies in `out/split/snap/{C,F,U}`, read-only, `HASHES.txt` sha256/12 `6a368e804fb0`; CSS
`e1359ab9994a` in all three):

| arm | build | JS sha256/12 | how it was made |
|---|---|---|---|
| C | v9-final, as P-152's C | `647c9ef2b1e2` | copy of `out/p152/snap/C` |
| F | C + F1 only | `b1c1320fde83` | `split/f1-only.diff` (`ac63c37da60a`, delta.diff hunk 3) with `patch -F0` |
| U | C + U2 only | `4389044c1ec4` | `split/u2-only.diff` (`2f69e5532ad3`, delta.diff hunks 1, 2, 4) with `patch -F0` |

Byte checks:
- C + F1 + U2 gives `a6426953727a` in both orders, which is P-152's V. So the two halves are exactly V's change and nothing else.
- `node --check` passes on both arms.
- F differs from C in 3 lines (1 out, 2 in) and U in 17.

**Metric** (new, found in P-152's data; this block is its confirmatory test, and P-152's runs are never pooled with it):
- CB34 is the number of moving end-zone frames going down (scrollY below the previous frame) at 0.2 <= m < 0.55 with dt > 34.
  CB50 is the same with dt > 50.
- m is the reader's value, (scrollY - (maxY - innerHeight)) / innerHeight.
- For reference, P-152's CB34 was C 6 / 3 / 5 / 7 (median 5.5) and V 23 / 21 / 21 / 14 (median 21).
- Reported per arm but deciding nothing: the P-152 end-zone counts (>30 ... >54) and the Timeline main-thread totals on the CB frames.

**Predictions** (bounds fixed now):
- P1, F1 is the cause: F − C median CB34 >= +8, and every F run above every C run (3 v 3, exact one-sided permutation p = 1/20).
- P2, U2 is not: U − C median CB34 <= +3 (P-152's C spread is ±2 around its median, plus 1).
- How the outcomes read:

| outcome | reading |
|---|---|
| P1 and P2 both hold | F1's re-show is the cause in our setup. The off-main-thread mechanism stays UNRESOLVED. |
| F − C <= +3, and U − C >= +8 with U separated | U2 is the cause; the suspect is refuted. |
| F − C <= +3 and U − C <= +3 | Neither half alone: an interaction, or a P-152 artifact. UNRESOLVED. |
| anything else | UNRESOLVED (partial). |

- **U2 alone, no-worse read on the same block** (for landing U2 by itself under the less-work rule): P-152's rule on the U arm against C, end zone >34 and >50.
  - WORSE when the runs are separated, or when the median exceeds +2 / +1 with p <= 0.05.
  - Disclosed: 3 v 3 is weaker than P-152's 4 v 4, because p = 0.05 needs the most extreme ordering. The lead decides whether a PASS here is enough.

**Order, profile, holds:** profile xcode-serious and driver G (WDA gesture, the same program and pin as P-152, `g-fastshort-v1.json` `df597802d2f0`). Rev 1.4 hold rules unchanged:
- one item per hold;
- Safari parked, cooling below 38 °C (900 s cap) and a WDA check before every hold;
- start and end thermal gates; Critical or over 44 °C voids that hold and stops the block;
- each part runs in the background with the 2 h limit.

The holds:
- part 1: H1 WC, H2 WF, H3 WU (uncounted warm-ups, one per arm's port), H4 S0.
- part 2: H5 EC1, H6 EF1, H7 EU1.
- part 3: H8 EF2, H9 EU2, H10 EC2.
- part 4: H11 EU3, H12 EC3, H13 EF3.
- part 5: TAIL (one re-run per hold, then S1).

Over parts 2-4 the order is a rotated Latin square: each arm once in each position, and each arm opens one part. Timeline stays on in every counted run, and there are no separate attribution runs. The sentinels follow P-152's rule (control C). At most 2 blocks for this question.

**Kit (not built yet):** p152's block, hold, serve and read scripts adapted to three arms (C, F, U on three servers plus B), with these pins and a reader self-test. I build it after the lead's go, then do a dry run and a pre-data read as with P-152.

### Plan: the higher-m F1 variant (not built)

- **Proposed change:** set `visibility: hidden` only at m >= m_h = 0.75, instead of at fade 0 (m >= 0.55).
- **Why nothing changes on screen:** #platform draws nothing for all m >= 0.55 whatever the panel does.
  - `opacity: min(var(--morph-fade), 0.9999)` and `filter: blur(...)` sit on `.start-selling-platform` (C's CSS 5698-5705).
  - fade = `QM(m)` = 1 − min(1, m / KM) with KM = 0.55 (C's JS 13579 and 13595-13597).
  - So opacity is exactly 0 from m 0.55 up, and the panel's coverage is not needed for the proof.
- **The cost:** F1's saving is lost at 0.55 <= m < 0.75, where toolbar steps repaint #platform again, as in C.
- **What it buys:** the layers come back while #platform is still invisible, before its fade-in. That gives (0.75 − 0.55) / speed of lead time.
- **Why I expect only a partial fix:** P-152's records (exploratory) say this won't cover the cost.
  - Closing speed from m 0.55 to 0.2 has a median of 2.2-3.3 m/s (range 0.3-6.7), so m_h = 0.75 buys about 60-90 ms.
  - V's extra slow closing frames span about 400 ms after the un-hide:

    | time after the un-hide | 0-50 ms | 50-100 ms | 100-200 ms | 200-400 ms | 400-800 ms |
    |---|---|---|---|---|---|
    | C slow closing frames | 2 | 1 | 7 | 8 | 0 |
    | V slow closing frames | 25 | 9 | 20 | 14 | 8 |

  - Even m_h = 1 buys only about 150 ms at median speed.
- **A variant more likely to work:** keep #platform's layers alive and only stop what repaints them at opacity 0 (pause its animations at fade 0). It costs no rebuild, but needs its own Chrome cost card first.
- **Either variant** needs a cost card, a pixel check and a phone check. The split block above comes first.

## Pending

- Done: the v9.2 Simulator pixel rerun before the zone and the step A rerun (both in `fixes/end-morph/README.md` section 5).
- P-152, the phone no-worse check (less-work rule):
  - Rev 1.1 waits for the lead's delta check and signature, then runs through the phone (reconnected, WDA ready).
  - Phone servers: `phone/p152-serve.sh`, on the copy of int-v8's snapshot.
