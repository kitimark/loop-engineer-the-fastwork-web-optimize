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
  - Part 1 07:07-07:32Z (after C-079), part 2 07:33-07:53Z, part 3 07:54-08:14Z: H1-H10 VALID. Every gate read Serious with induced Yes, battery 34.89-38.59 °C, none Critical. Before every hold: Safari parked, cooling below 38 °C met, WDA ready.
  - Correction (lead, 09:05Z; an earlier version of this entry said "cooling met at once", which is wrong). Cooling
    waits before each hold, from `out/p152/cooling.log`:

    | hold | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 | H11 | H12 | H15 | H16 |
    |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
    | wait (s) | 0 | 0 | 180 | 180 | 60 | 180 | 180 | 60 | 180 | 120 | 0 | 0 | 0 | 180 |

    The phone reached 38.0 °C at the end of the H3 and H8 waits. The 900 s cap was never reached.
  - Part 4, first start 08:15Z: the part-start WDA restart failed (automation-mode timeout, BUILD INTERRUPTED), exit 5, before any hold or gate; nothing counted lost (incident I-220, lead). The log is `out/p152/block2-r15-part4-stop0815.log`.
  - Part 4 rerun 08:26-08:49Z (after the C-082 re-plug): H11 EC4, H12 S1 (TAIL: no re-runs), H15 AC1, H16 AV1 VALID. The phone went to the user (T-214) at 08:49:37Z with no keep.
  - EC4 ran after a 1052 s gap at 34.79 °C (the re-plug pause); the other counted runs had 362-507 s gaps at 36.89-37.69 °C.
- **Read (p152-read.mjs pin 74ffb1031287, on out/p152/runs; `results-p152.json`): DECISION FAIL, V WORSE than C, threshold-sensitive.**
  - Sentinels: S0 PASS (fps 55.4, slow 0.031), S1 PASS (fps 54.9, slow 0.037).
  - End zone, per run, frames dt>34 / dt>50: C 28/1, 30/4, 36/8, 35/3; V 76/24, 42/4, 58/14, 40/10. Median V-C: >34 +17.5 (p 1/70, separated), >50 +8.5 (p 3/70); both bounds exceeded, so WORSE at both registered thresholds. Twins: >30 +15.5 (p 5/70), >38 +15, >46 +9.5 (p 3/70), >54 +5.5 (p 4/70).
  - Disclosed as signed: EV1 and EV3 are the "position-confounded" slot (the first V run of parts 2 and 3), and they carry the two largest V counts (76/24 and 58/14). The other two V runs (42/4, 40/10) are also above every C run at >34, and at or above C's median at >50, so the slot does not explain the whole gap (descriptive, decides nothing).
  - Attribution (decides nothing): paints per frame AC1 11.74 (m high) / 11.18 (low), AV1 11.71 / 11.11; the less-work saving seen in Chrome and the Simulator does not show as fewer paints here.
  - The phone no-worse check is not met as registered. The lead rules on the next step; this is block 2 of 2 for P-152.
- **Lead ruling (09:05Z):** DECISION FAIL is confirmed by ops-reader-P152, whose own recount is equal at all 6 thresholds. The block is threshold-sensitive only on the twins' p values; the outcome is unchanged. F1+U2 does not land as measured and leaves the v10 plan.
- **Context** (decides nothing; added at the lead's request). The reader notes the measured size is likely at the high end. The direction holds in every F1+U2 run in the closing band, 0.2 <= m < 0.55.
  - **Attribution runs' end-zone totals.** These are the same gesture with Timeline on, after S1. They are reversed: AC1 (C) 50 / 15, AV1 (V) 37 / 9 (dt > 34 / dt > 50; n 1325 / 1422). In the closing band (CB34 / CB50) AC1 has 10 / 5 and AV1 13 / 1.
  - **The same V JS in P-153.** P-153's C arm is this V's JS, `a6426953727a`. There its end zone read 30 / 28 / 32 / 44 at dt > 34, against 76 / 42 / 58 / 40 here (figures from ops-reader-P152, not recomputed here). That is another block on another day, so it is never pooled.
  - **Starting temperatures.** V's counted runs started warmer: battery at the hold start was C 36.89 / 37.29 / 37.09 / 34.79 °C and V 37.5 / 37.59 / 37.29 / 37.69 °C. That is a median of +0.5 °C for V; without EC4's cool start after the re-plug, about +0.4 °C. All runs were under the same xcode-serious condition, and every gate read Serious.

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

## Split block: P-155 (SIGNED by the lead 09:10Z as drafted in ed1ed7cf; written before any data)

The lead's terms at signing:
- The arms, the snapshot hashes, the CB34 / CB50 metric (confirmatory, never pooled with P-152), and P1 and P2 are exactly as written below.
- The U arm uses P-152's no-worse rule against C at 3 v 3. A PASS there is enough to land U2 under the less-work rule, because U2 only removes work; the weaker power is disclosed. A FAIL means U2 does not land.
- Block 1 of at most 2. Profile xcode-serious, rev 1.4 heat rules, Safari parked before every cooling wait.
- Every part runs in the background with the 2 h limit and `--keep 120`.
- No Instruments trace in this block. The pause-at-fade-0 variant gets a Chrome cost card after P-155; it decides nothing now.

The lead re-signed at 09:30Z, before any data, after ops-reader-P155's pre-data read: CLEAN in pins, arms, reader and block, with 4 doc items to fix first. These rulings override the text below where they differ.
1. **Block 2** runs only if block 1 is VOID or INSUFFICIENT; a block 1 with any outcome stands. Block 2 is read alone and never pooled. It needs a kit delta (an archive path like `p152-block.sh` 56-64) checked by the lead before it runs.
2. **U2 lands only if BOTH** its end-zone no-worse rule PASSES **and** P2 holds (U − C median CB34 <= +3). An outcome "U2", or a P2 miss, keeps U2 out whatever the no-worse result.
   - U2's no-worse result decides even if F is INSUFFICIENT; C and U need 3 valid runs each.
   - The reader computes P2 only when all three arms have 3 valid runs. If F is short, P2 is taken from the reader's printed CB34 lists for C and U, the same medians by hand. No code change: the reader's pin stays `100cdaca75de`.
3. **Disclosed, the cyclic carry-over in the order.** The run before each counted run is fixed by arm:
   - F always follows C (EF1 after EC1, EF3 after EC3);
   - U follows F (EU1 after EF1, EU2 after EF2);
   - C follows U (EC2 after EU2, EC3 after EU3).
   - The part openers are EC1 (after S0, also on C), EF2 and EU3.
   - Time positions are balanced: each arm's mean position is 5 of 9.
   - A carry-over from the previous arm (heat, Safari state) can't be told apart from the arm effect here. Every hold starts after Safari is parked and the phone has cooled below 38 °C, which limits it.
4. **The owner's probabilities, written before data (subjective):**

| | probability |
|---|---|
| P1 holds | 0.55 |
| P2 holds | 0.80 |
| Outcome "F1 re-show" | 0.45 |
| Outcome "UNRESOLVED (partial)" | 0.30 |
| Outcome "neither alone" | 0.20 |
| Outcome "U2" | 0.05 |
| U2 NO-WORSE PASS | 0.80 |
| U2 lands (PASS and P2) | 0.70 |

   - P1 is not higher because P-152's size is likely its high end (ops-reader-P152), and 3 v 3 needs full separation.

- **N1:** the closing-band ±4 ms twins (CB30 / CB38 for CB34, CB46 / CB54 for CB50) are computed after the data with the same `closingBand`. "Threshold-sensitive" there is a label only and changes no outcome.
- **N5:** CB50 decides nothing; it is reported.

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

**Kit (built after the signature, before any data):** P-152's rev 1.4 + park scripts adapted to three arms.

| file | sha256/12 | what changed against P-152 |
|---|---|---|
| `phone/p155-serve.sh` | `144a9315147b` | B, C, F and U servers; the snapshot copy is checked against `6a368e804fb0` and six pinned files |
| `phone/p155-hold.sh` | `92987c1153fd` | items WC/WF/WU, S0/S1, E[CFU]1-3 and their re-runs; all three arms' served JS and CSS checked before every item; no attribution items |
| `phone/p155-block.sh` | `a8f6bba6fe2c` | P-152's driver: one item per hold; Safari parked, cooling below 38 °C (900 s) and a WDA check before every hold; TAIL scans every hold log for E[CFU]n |
| `phone/p155-read.mjs` | `100cdaca75de` | the decisions above; imports P-152's endZone, decideNoWorse and holdStatus from `p152-read.mjs` (`74ffb1031287`) |

The reader's self-test passes (14 checks; P-152's reader still passes its 39). Cross-check: the reader's closing band on P-152's runs gives exactly the CB34 values above (C 6 / 3 / 5 / 7, V 23 / 21 / 21 / 14).

Dry runs, 09:1xZ, with the P-155 servers up:
- All five parts give HOLD DRY ok for every hold. Each arm's PLAN line names its own port, and the served JS checks C, F and U on every hold.
- A two-item hold is refused (exit 2).
- TAIL with fixture logs naming EU1 (H7) and EF2 (H8) ran H14 EU1r, H15 EF2r and H16 S1.
- Dry logs and fixtures are in `out/p155/dry-pre/`. The pre-data read on the empty `out/p155/runs` gives VOID (no sentinel), with every run "no valid try".

Commands (the runner's, Bash `run_in_background`, timeout 7200000):
- `TICKET=P-155 node tools/lock.mjs run iphone --owner iphone-runner --block P-155 --max-seconds 3600 --keep 120 -- sh fixes/end-morph-f12/phone/p155-block.sh H1:WC H2:WF H3:WU H4:S0`
- then `... H5:EC1 H6:EF1 H7:EU1`, `... H8:EF2 H9:EU2 H10:EC2`, `... H11:EU3 H12:EC3 H13:EF3`, `... H14:TAIL`.

### P-155 block 1 log

| time (Z) | event |
|---|---|
| 09:26:23 | Part 1 started (H1 WC, H2 WF, H3 WU, H4 S0). |
| 09:47:31 | Part 1 ended with exit 0: H1-H4 all VALID (232 / 228 / 229 / 219 s); sentinel S0 PASS (fps 55, slow 0.035). Log `out/p155/part1.log`. |
| 09:47:45 | Part 2 started (H5 EC1, H6 EF1, H7 EU1), inside the 120 s keep window. |
| 09:49:50 | Part 2 STOP, exit 5, before H5's start gate. WDA did not come back after its restart: "Failed to initialize for UI testing: Timed out while enabling automation mode" (`out/p155/wda-restart-1791280069.log`). No hold ran, so none is void. Reported to the lead first. The lead counts it as I-220 (third today). |
| 09:51:41 | The user re-plugged the phone (console step C-083) and restarted the Xcode thermal condition. Lead: "phone ready", rerun part 2 unchanged; a start gate that does not read Serious (induced) stops the part. |
| 09:53:07 | Part 2 rerun started, unchanged (H5 EC1, H6 EF1, H7 EU1). Log `out/p155/part2r.log`; the stopped try's log is `out/p155/part2.log`. |
| 09:55:05 | Part 2 rerun STOP, exit 5, before H5 again. This time the WDA runner started on the device, but the local forward on port 8100 never became reachable (`out/p155/wda-restart-1791280384.log`). No hold ran. Reported to the lead first; waiting for its go. |
| 09:57-09:58 | Lead: the Mac sat at load1 70-95 during that try; rerun once chrome-measure has been idle for 60 s. That wait was MET at 09:58:05Z. |
| 09:58:25 | Part 2, second rerun, started (log `out/p155/part2r2.log`). |
| 10:00:26 | STOP, exit 5, before H5: the same WDA failure (runner up on the device, port 8100 not reachable; `out/p155/wda-restart-1791280704.log`), with load1 about 8-16. No hold ran. This was the third WDA failure, so I stopped and handed it to the lead, as ordered. |
| 10:0x-10:12 | Lead: usbmux saw no iPhone on USB (0 devices) while CoreDevice still reached it, so the runner started but iproxy had nothing to forward. Re-plug steps C-084 and C-085 followed. The USB link was back at 10:12:37Z, on another Type-C port. |
| 10:13:22 | `idevice_id -l` counted 1 device. Part 2, third rerun, started unchanged (log `out/p155/part2r3.log`). My queued Simulator pixel job was dropped first, so nothing of mine held the Mac before H5. |
| 10:32:26 | Part 2 ended with exit 0: H5 EC1, H6 EF1, H7 EU1 all VALID (231 / 222 / 228 s). The T-215 census (about 25 s, shared w1) ran in the gap. |
| 10:33:16 | Part 3 started (H8 EF2, H9 EU2, H10 EC2). |
| 10:51:30 | Part 3 ended with exit 0: all VALID (230 / 234 / 229 s). The census of C against (c) at m 1 ran in the gap. |
| 10:52:19 | Part 4 started (H11 EU3, H12 EC3, H13 EF3). |
| 11:11:18 | Part 4 ended with exit 0: all VALID (234 / 226 / 222 s). |
| 11:11:3x | Part 5 started (H14 TAIL). |
| 11:13:3x | Part 5 STOP, exit 5, before any hold: WDA "Timed out while enabling automation mode" (`out/p155/wda-restart-1791285092.log`). USB showed 1 device. No run gate had failed, so only S1 was left. A pre-S1 read gave VOID (no S1), FYI only. |
| 11:14:51 | Lead go: one retry in my own phone hold with `wda stop`, a 10 s pause, `wda start` and `wda check`, then part 5 unchanged (`out/p155/part5r.log`). WDA came up READY. |
| 11:19:5x | H14 S1 VALID 235 s; sentinel S1 PASS (fps 55.3, slow 0.032). Block 1 complete: 14 of 14 holds VALID, both sentinels PASS. |

### P-155 result (block 1; the read is `phone/p155-read.mjs`, `results-p155.json`; the lead and ops-reader-P155 confirm)

| arm | CB34 per run | CB50 (reported only) | end zone >34 per run |
|---|---|---|---|
| C (v9-final) | 0 / 2 / 0 | 0 / 0 / 0 | 25 / 30 / 22 |
| F (C + F1 only) | 7 / 9 / 10 | 0 / 0 / 0 | 26 / 24 / 27 |
| U (C + U2 only) | 12 / 0 / 5 | 2 / 0 / 2 | 80 / 21 / 47 |

- **SPLIT: UNRESOLVED (partial).** Confirmed by ops-reader-P155 on every number. Lead ruling 11:33Z: U2 does not land, F1 stays out, block 2 does not run.
  - **P1 holds, threshold-sensitive.** F−C CB34 median is +9 (at least 8), with the ranges separated.
    - F1 alone reproduces P-152's closing-band excess only in part: +9 here against +15.5 in P-152 (V 23/21/21/14 against C 6/3/5/7).
  - **P2 fails, threshold-sensitive.** U−C CB34 median is +5 (the limit is 3). U is mixed: EU2 equals C, while EU1 and EU3 are high (end zone 80 and 47). Why U bursts stays UNRESOLVED; no more phone time on it now (lead).
  - **The CB twins** (N1: computed after the data, a label only; scratch `p155-twins.mjs`):

    | threshold | C | F | U | F−C | P1 | U−C | P2 |
    |---|---|---|---|---|---|---|---|
    | > 30 ms | 1/5/0 | 11/12/12 | 15/0/14 | +11 | holds | +13 | fails |
    | > 34 ms | 0/2/0 | 7/9/10 | 12/0/5 | +9 | holds | +5 | fails |
    | > 38 ms | 0/1/0 | 4/6/0 | 5/0/2 | +4 | fails (EF3 0 overlaps) | +2 | holds |

    Both P1 and P2 flip at the 38 ms twin.
- **U2's end-zone no-worse rule (decides U2's landing, with P2): PASS.**
  - The median U−C exceeds the bound at all 6 thresholds: +37, +22, +21, +16, +13 and +9 at >30, 34, 38, 46, 50 and 54.
  - No permutation p reaches 0.05 (3/20 to 4/20). So under the rule it is "not WORSE", which is weak at 3 v 3 (disclosed); the PASS does not mean "no worse in fact".
  - Under ruling 2 (PASS and P2), **U2 does not land**: P2 fails.
- **F1 against C, by the same rule (decides nothing):** NO-WORSE PASS.
- **Block 2 does not run** (ruling 1: only on VOID or INSUFFICIENT).
- **Timeline on CB frames, total ms (decides nothing):**

  | arm | Composite | RecalculateStyles | Layout |
  |---|---|---|---|
  | C | 6906 | 718 | 621 |
  | F | 5615 | 591 | 475 |
  | U | 7472 | 799 | 652 |

- **Kit and profile:**
  - Kit unchanged through the block: p155-serve `144a9315147b`, p155-hold `92987c1153fd`, p155-block `a8f6bba6fe2c`, p155-read `100cdaca75de`.
  - Profile xcode-serious. The user restarted the Xcode condition at 09:51Z, after re-plug C-083.
  - Parts 2 and 5 needed WDA retries (I-220, plus the USB re-plugs C-083 to C-085). No counted hold ran under a failed start.

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

## T-204 #32: what #platform does while it fades (analysis and options; no phone, decides nothing)

The question (the user's): does #platform's fade in and out during the morph cost frames? The fade is on
`.start-selling-platform` (v9-final CSS 5698-5705): `filter: blur(calc((1 - var(--morph-fade)) * 12px))` and
`opacity: min(var(--morph-fade), 0.9999)`. `--morph-fade` is registered non-inheriting (CSS 1608) and is written inline
by S() (JS 14156) as QM(m) = 1 - min(1, m / 0.55). So the section fades over 0 < m < 0.55 and is at opacity 0 for
m >= 0.55. Line numbers are v9-final's (`out/p155/snap/C`); the baseline's are CSS 5389-5393 and JS 13017.

### 1. What #platform renders across the fade (Chrome, OBSERVED in our setup)

Probe: `fade-probe.mjs` / `fade-probe2.mjs` (scratch). It runs headless at 430x932 DPR 3 with touch, no throttle,
counts only, in the shared lane, on v9-final (C). It reads the LayerTree, the running animations and the computed
filter and opacity at each m. Static parks snap to m 0 or 1: the morph-scroll settle moves a resting page to an end.
So the mid-fade rows (fade-probe2) are read 130-200 ms after the scroll, before the settle.

| m | fade | blur | #platform layers (all draw) | running animations | #platform repaints |
|---|---|---|---|---|---|
| 0 | 1 | 0 px | 40 | 5 | 0 in 1 s |
| 0.05 / 0.2 / 0.35 / 0.5 | 0.91 / 0.64 / 0.36 / 0.09 | 1.1 / 4.4 / 7.6 / 10.9 px | 40 | 5 | 0 / 3 / 3 / 3 (the 3 in-view title mask layers, once after the fade change) |
| 0.7 and 1 | 0 | 12 px | 40 | 5 | 0 in 1 s |

- **Layers:** the same 40 at every m. Their compositing reasons: ActiveTransformAnimation 24, ActiveOpacityAnimation 17, WillChangeTransform 11, StickyPosition 1, Overlap 1.
  - On the Simulator (WebKit) the platform-idle census found 26 layers (`fixes/platform-idle/README.md` "Layers and memory").
- **Running animations at every m, fade 0 included:** the 3 title sweep bands (`pi-sweep-band` on `::after`, 4 s linear, infinite) and the 2 secure-network glints (`pi-glint-left/right`, 5 s, infinite).
  - Their gates are IntersectionObservers (sweep gate JS 4022-4040; glint IO >= 0.35, JS 13100-13116).
  - An IntersectionObserver does not look at opacity (inferred). So at opacity 0 the section stays `visibility: visible`, and the 5 animations keep running.
  - This is F-182's point, now confirmed for this build in Chrome.
- **Other animations:** 24 in total, the rest finished one-shots. At m = -0.3 the agents caret also runs.
- **No section-wide repaint:**
  - The animations are compositor animations (transform and opacity): they repaint nothing while idle.
  - The 3 in-view title mask layers (`mask-clip: text`) repaint once after each fade change (OBSERVED, cause unknown).
- **No backdrop-filter is rendered inside #platform.** `.agents-card-chat`'s `blur(6px)` (CSS 10765) has no element in the JS.
  - Over #platform sit the nav glass `backdrop-filter: blur(20px * (1 - m))` (CSS 11814) and the panel's own blur and opacity (CSS 10959-10963).
- **Images inside:** `service-bg.jpg` 576x1024 and `service-quote/bg.png` 736x1349 behind a `filter: blur(16px)` stage bg (CSS 6686), the grain tile 256x256 with `mix-blend-mode: overlay`, and the hex rings 557x615. There is no video and no canvas. (Map by a read-only helper; lines verified on the ones cited.)

### 2. Per-frame cost in the fade band (P-152 C = v9-final, Timeline, G driver; exploratory)

Slow share = moving lastScreen frames with dt > 34 ms. Composite is WebKit's main-thread layer flush, per frame. Each cell gives the slow share, then the Composite time.

| m band | closing | opening |
|---|---|---|
| 0-0.2 (fade 1 to 0.64) | 2.6 %, 11.32 ms | 8.1 %, 10.78 ms |
| 0.2-0.55 (fade 0.64 to 0) | 1.9 %, 10.40 ms | 2.5 %, 7.70 ms |
| 0.55-1 (fade 0, invisible) | 0.9 %, 9.24 ms | 2.3 %, 9.12 ms |

- **Before the zone (opening):** Composite 4.17 ms per frame. Paint is 0.4-0.55 ms per frame everywhere.
- **P-153's C (v9-final + F1 + U2), closing 0.2-0.55:** 4.4 % slow.
- **Reading:**
  - The fade band is somewhat worse than the invisible band, by 1-2 ms of Composite and 1-6 points of slow share.
  - The hot spot is the morph start, opening m 0-0.2.
  - The whole zone flushes at about twice the page's Composite cost even with #platform invisible (m >= 0.55). The nav panel and #platform's 26-40 live layers are both in that flush, and the Timeline cannot split them.
  - The Timeline shows only the main thread. The blur's GPU cost is not in these numbers (a full-viewport blur of a 26-40 layer group, radius up to 36 device px, under the nav's backdrop blur).
  - So the user's instinct is plausible, but it is not shown by this data.

### 3. Options (to build as a proposal with Try-it; none built yet)

| option | what changes | pixels | what it could save | risk |
|---|---|---|---|---|
| (c) pause at fade 0 | an attribute set by S() when fade = 0 pauses every animation under #platform (`animation-play-state: paused`); layers stay | identical while invisible. On the way back the sweeps and glints resume from their paused phase, like the existing IO sweep gate | the 5 running compositor animations at m >= 0.55 (render-server work, not main thread) | lowest. No layer rebuild, unlike F1's `visibility: hidden` (P-152 FAIL, suspected re-show cost; P-155 is splitting it now) |
| (a) pause while fading | the same pause from fade < 1 (m > 0) | NOT identical: the sweeps and glints freeze while the section is still visible and blurring | the same, plus the fade band | small visible difference; Try-it needed |
| (b) flat overlay over a static #platform | drop the section's filter and opacity; fade in an overlay of the background colour (opacity 1 - fade) between #platform and the nav (z-index below 40), plus (c)'s pause | NOT identical: no blur. The opacity part is exact only if what is behind #platform is one flat colour (to check) | the full-viewport animated group blur, which is the biggest GPU candidate | visible difference (sharp text fading instead of blurred); Try-it needed |
| (d) scroll-driven fade (arch-compositor-morph's idea) | `animation-timeline: --fwms; animation-range: entry 0% entry 55%` on #platform instead of S()'s inline write | identical by construction | one inline style write and one element restyle per frame. Small: `--morph-fade` is already non-inheriting | WebKit restyles every element with a scroll-driven animation on each update (F-157, KeyframeEffect.cpp per arch). #platform itself has no infinite animation, so this is probably small. UNRESOLVED on WebKit |

- **Order I propose:**
  1. (c) first: identical, cheap, and orthogonal to P-155.
  2. Then (b), the only option aimed at the blur.
  3. (a) only if (c) shows a gain and the user accepts frozen sweeps during the fade.
- **Before any phone check:** a Chrome cost card per option (layers, running animations, repaints; counts only), plus pixel stops (PR-010) for (c) and (d).
- **Ownership:** arch-compositor-morph's nav plan does not touch `.start-selling-platform` or CSS 5698-5705. An overlay for (b) must stay below the nav's z-index 40, so the nav glass still samples it.

### 4. Built: (c), (a), (b) on v9-final (lead go 10:0xZ; overlay copies only)

The diffs are against v9-final (`out/p155/snap/C`), in `fade/`. The snapshot copies are in `out/fade/snap/{c,a,b}`.

| option | diff | served JS / CSS (sha256/12) |
|---|---|---|
| (c) pause at fade 0 | `fade/c-pause-at-0.diff` | `db7257e81859` / `192f62c106d1` |
| (a) pause while fading | `fade/a-pause-while-fading.diff` | `5545cf9f70bd` / `f125b8924aa4` |
| (b) overlay + (c)'s pause | `fade/b-overlay.diff` | `c9663b4e1c5b` / `4af2cf8911e9` |

- **JS:** S() (JS 14156) toggles `data-fw-pf-paused` on `.start-selling-platform`.
  - It writes only on a crossing: fade 0 for (c) and (b), fade < 1 for (a).
  - The written state is held in `__pfP`, so S()'s per-frame call adds one comparison.
- **CSS:** `animation-play-state: paused !important` under that attribute, only on the infinite idle animations:
  - the 4 sweeping titles and their `::after` bands;
  - the cred, currency and review marquees;
  - the glint svgs;
  - the agents caret `::after`.
- **Why only those:**
  - Card r1 paused every animation under #platform (`*`, `::before`, `::after`).
  - Chrome then dropped 18 of the 40 layers (the finished one-shot entrances lost their active-animation reason). It did not re-promote them on the way back.
  - In that run the reopen step repainted 36 times against C's 3 (OBSERVED, cause unknown). That is the F1-like re-show cost to avoid, so r2 narrowed the list.
- **(b)** applies to `html.fw-ms` only (touch phones). There #platform loses its filter and opacity and gets a `::after` overlay:
  - #f5f5f3, the `.start-selling` background, the only thing behind #platform;
  - `bottom: 0; height: 100lvh`, z-index max inside #platform's own sticky stacking context, so it stays under the nav;
  - `opacity: calc(1 - var(--morph-fade))`, with `--morph-fade: inherit`, since the property is registered non-inheriting;
  - `will-change: opacity`, `pointer-events: none`.
  - Desktop keeps the blur and opacity fade.

**Chrome cost card** (`fade-card.mjs`, scratch): headless 430x932 DPR 3 with touch, no throttle, counts only. Path m 0 → 0.3 → 0.8 (settles to 1, fade 0, held 1 s) → 0.3 → 0. Run r2 at about 10:05Z.

| arm, stop | running anims under #platform | #platform layers | repaints in the stop | style recalcs / layouts in the stop |
|---|---|---|---|---|
| C, fade 0 | 5 | 40 | 0 | 65 / 16 |
| c, fade 0 | 0 (6 paused) | 40 | 0 | 65 / 16 |
| C, back to 0.3 | 5 | 40 | 36 (r1: 3) | 16 / 2 |
| c, back to 0.3 | 5 | 40 | 6 | 10 / 2 |
| a, 0.3 (both ways) | 0 | 40 | 0 / 0 | 12 / 1, 16 / 2 |
| b, 0.3 | 5 | 41 (+ overlay) | 24 / 34 | 14 / 2, 19 / 3 |

- **Reading:**
  - (c) does exactly what it says. At fade 0 no #platform animation runs, the layers are unchanged and nothing is added to style or layout.
  - Repaints on the reopen step vary from run to run (C 3 in r1, 36 in r2). They are no signal.
  - (b)'s overlay reads opacity 1 − fade (0.546 at fade 0.454). The section's filter is `none` and its opacity 1.
- **What Chrome cannot show:** the expected saving is compositor/render-server work (5 compositor animations kept alive at opacity 0), not main-thread work. Only the phone can show whether it matters.

**Simulator pixel check (c)**, `em-px2.mjs --engine sim` (fw-sim, PR-010 A/A, 18 stops, about 11:25Z): 0 consistent at up0.8 to up1 and at dn0.5 to dn0, where (c) acts or has just resumed. From "pre" to up0.6 the check finds 45 css px² consistent (0.011 %, flat 0.037), always the same box, css 48-112 x 16-48, under `.start-selling-top-nav-bar` (the nav logo).
- That box is outside #platform, and it is there at "pre", where (c) is inert (fade 1, no attribute). So it is load noise in the nav, not (c).
- It is within T2 either way: fill 45 of 64 css px², 0.011 % of 0.5 %.

**Chrome pixel check (c)**, `em-px2.mjs --engine chrome`, PR-010 multi-pair A/A (A = C, V = c, 430x775, 18 stops): every stop has 0 css px² consistent, A~V beyond A/A 0, max 3 (`out/end-morph/px2-chrome-pf-c-2026-10-06T10-05-48-123Z`). The tool freezes running animations at 4000 ms. So the only difference (c) can make, the sweep and glint phase after a return from fade 0, is outside this check by design. It is the same as the existing IO sweep gate.

### 5. T-215: what runs at the page end that nobody sees (census, v9-final, Chrome, OBSERVED in our setup)

The user's idea (T-215, on T-204 #34): stop every animation that cannot be seen, e.g. the countdown and everything behind the open panel.

**Census setup** (`census.mjs`, scratch):
- Headless at 430x932 DPR 3 with touch, CPU 1x, in the idle-triple setup (headed UA, focus emulation). Counts only.
- 3 s per stop. m 0.55 is held with em-px2's synthetic touch.
- A document-start shim keys every rAF, timer and observer callback by its registration site, and every DOM write by its target. Every running animation is listed.
- Each target is classed as visible, covered (its centre hits the nav panel), offscreen, or hidden (an opacity-0, display-none or visibility-hidden ancestor).
- LayerTree paintCount deltas are taken per layer.
- Run in the gap between P-155 parts 2 and 3. Log: `out/fade/census-C.log`.

| stop | running animations | JS callbacks /s | DOM writes /s | layers repainted /s |
|---|---|---|---|---|
| m 0 | #platform: 3 title sweep bands and 2 glints, all visible | none | none | 3 title mask layers, 60 each |
| m 0.55 | the same 5: 2 visible, 3 covered by the 65 %-opaque panel. Panel: 3 column tracks | rAF JS 4328 about 25; setInterval(1000) JS 4454: 1; rAF JS 4326: 1 | span.strip style 26, span.cell style 11, countdown data-value and aria-label 1 each | `.start-selling-morph-veil` 806x1046: 26; 2 glint svgs: 6 each |
| m 1 | the same 5, all hidden under #platform's opacity 0. Panel: 3 column tracks | the same | the same | `.start-selling-morph-veil` 812x1816: 26 |

- **The countdown in the open panel is the panel's own clock** (`.countdown.inverse`), and it is visible, so it must keep running.
  - Its digit roll is the original rAF spring (JS 4328), by cd-roll-ca's choice (JS 4286-4291): a compositor roll would put its cells on layers and change glyph rasterisation.
  - Each frame of the roll writes strip styles and repaints the whole veil layer.
  - Pausing does not apply. Paint containment or a small own layer for the clock might, after a pixel check (finding posted).
- **The hero countdown and every other section** are already gated at the page end: no callback in 3 s (the hero clock's slow read is 1 per minute).
- **So the unseen work at the page end** is only #platform's 5 infinite animations at opacity 0, which is option (c) above.
  - The countdown rule asked for (recompute from the clock, never skip a visible second) already holds for the hero clock (`__cdPause` / `__cdGo`, JS 4441-4456).
  - (c) does not touch any clock.
- **(c) at m 1:** census, the same setup, C then c, in the gap between parts 3 and 4 (`out/fade/census-m1-Cc.log`).

| arm | running animations | of them unseen | JS callbacks /s | DOM writes /s | layers | repainted /s |
|---|---|---|---|---|---|---|
| C | 8 | 5 (#platform, opacity 0) | 26.3 + 1 + 1 | 26.3 + 11 + 1 + 1 | 68 | veil 26.3 |
| c | 3 (panel columns) | 0 | 25.7 + 1 + 1 | 26.7 + 11 + 1 + 1 | 68 | veil 26.7 |

  So (c) removes every unseen animation at m 1. It adds no JS callback, write or layer; the rest is the visible panel clock.

### 6. PR-029 rev 2 (user changes-requested 11:46Z; lead order 12:15Z)

The user asked for three things.
- Point 1: (b) "has bug of background fade-out sometime when it on Serious profile".
- Point 2: try arch-compositor-morph's (CM) change instead.
- Point 3: CM is the top priority.

The lead added: trace (b) from existing data, fix it or drop it, keep (a), and say how (a) relates to CM.

**Trace of (b).** The cause is UNRESOLVED.
- **Phone data on (b): none.** P-155's arms were C, F and U, so no phone run ever loaded (b). The user's Try-it session left no frame log.
- **Toolbar emulation.** Chrome headless, 430 px wide, DPR 3, touch, no throttle, counts and geometry only. The probe is `cover-geo.mjs` in the scratchpad; the output is `out/fade/cover-geo.json`, not committed. It ran in one 106 s shared probe job, 12:55-12:57Z.
  - Arms: v9-final and (b).
  - The page was held mid-morph with a synthetic touchstart at m 0.1, 0.3, 0.5 and 0.6.
  - The viewport height went 932, 852, 932, 852, a stand-in for the Safari toolbar.
- **What the probe found (OBSERVED):**
  - At all 16 (b) rows the cover box ran from y 0 to innerHeight: it covered the viewport exactly.
  - The cover's opacity was exactly 1 − `--morph-fade`.
  - `--morph-fade` was the same value as v9-final's at every row.
  - The section stayed at opacity 1 with no filter.
  - A height change mid-morph moves m and the fade in one step, for both arms alike. For example, 932 to 852 moved m from 0.1 to 0.203 and the fade from 0.82 to 0.63.
- **What the probe cannot show.** Chrome's emulation sets lvh = dvh = innerHeight. The Safari case, where lvh and dvh differ while the toolbar moves, and any WebKit layer behaviour (for example the opacity-0 cover's backing store) remain untested.
- **The decisive check.** A G or F run of (b) at Xcode Serious with Timeline, looking at the frames around the toolbar transitions. P-155's G runs show 25 transitions of 244-334 ms per run (775↔815). It was not run, because (b) is dropped.

**Decision in rev 2.** (b) is dropped instead of guessing a fix; (a) stays as the only option.
- Rev 2 recommends (a) only after CM, with one short phone no-worse check on top of CM. Declining is fine too: (c) still pauses the shimmers at fade 0.

**(a) and CM.**
- CM v1.1's delta against v9-final (`fixes/compositor-morph/delta.diff` in arch-compositor-morph's worktree) has no hunk in S() (JS 14151-14157) and no rule for `.start-selling-platform` or `--morph-fade`.
- `patch --dry-run` of `fade/a-pause-while-fading.diff` on CM v1.1's overlay applies cleanly, with no offset or fuzz. CM's overlay hashes are JS 887b4cde06eb and CSS 2948d49e47c6.
- So (a), and (c) likewise, stack on CM.

**What was posted.**
- Rev 2 of `proposal-fade.json` is a single solution, posted 12:59Z.
- Try-it A is v9-final, B is v9-final + (a); both phone pages stay up.

### 7. (c) on the phone: mechanism proof (T-204 #35; no ticket, no card, decides nothing)

The run was ordered by the lead at 14:58Z and ran 15:00-15:04Z under Xcode Serious.
- Command: `lock.mjs run iphone --owner fix-end-morph --max-seconds 600 -- sh phone/pfc-run.sh`. No block mark, no cooling wait.
- Arms: C = v9-final (JS `647c9ef2b1e2`) and c (JS `db7257e81859`). Both ran plain http over the LAN.
- Each arm got one M run (`__fwMorphDrive`, hold 2000 ms × 3 cycles, std probe), then `pfc-probe.mjs` at m 1: state, then a 6 s WebKit Timeline.
- int-v8's and CM's shared jobs ran on the Mac beside the M runs (load1 101 and 43), so this was not a quiet Mac. Output is in `out/fade/pfc/`.

| at m 1 | paused | running animations (in #platform) | Composite / RenderingFrame | Paint |
|---|---|---|---|---|
| C | no | 8 (4) | 0.682 ms (364 frames) | 167 / 31.78 ms |
| c | yes | 4 (0) | 0.683 ms (362 frames) | 165 / 30.67 ms |

| M run | frames | >50 | >34 | ±4 twins (>46 / >54 / >30 / >38) | max |
|---|---|---|---|---|---|
| C | 785 | 1 | 8 | 2 / 1 / 8 / 6 | 59 ms (y 6075, m 1) |
| c | 787 | 0 | 9 | 0 / 0 / 10 / 3 | 45 ms |

What this shows (OBSERVED in our setup, one run per arm):
- The mechanism works on the phone: the attribute is set at fade 0 and the 4 #platform animations WebKit lists stop.
- Composite time per frame at m 1 is the same within 0.001 ms, so on this phone the unseen animations cost no measurable compositing at rest.
- The M counts are one run each and decide nothing.
- The first run's layer counts failed: `pfc-probe.mjs` called `DOM.enable`, which WebKit's inspector does not have. The probe is fixed (`LayerTree.enable` only).

**Layer counts: probe-only rerun.**
- Ordered by the lead at 15:06Z; ran 15:07-15:09Z with `phone/pfc-layers.sh`, the same ports, a 2 s Timeline, and the layer counts after it.

| at m 1 | layers (document) | memory | #platform layers | #platform memory | Composite / frame (2 s) | Paint |
|---|---|---|---|---|---|---|
| C | 44 | 117.04 MB | 26 | 45.49 MB | 0.714 ms (123) | 62 / 10.85 ms |
| c | 44 | 117.04 MB | 26 | 45.49 MB | 0.644 ms (122) | 53 / 9.07 ms |

- (c) keeps every layer and its backing memory (OBSERVED): it pauses the animations and tears nothing down.
- The 2 s Composite and Paint differences are one short sample each. The 6 s sample above had them equal.

**Lead ruling (15:06Z).**
- (c) stays in v10 as a less-work fix.
- It is shown to work (running animations 8 → 4, in #platform 4 → 0), with no worse sign.
- The M runs decide nothing.

**Pins for int-v8's v10 card (unchanged since c825d3c3):**

| | value |
|---|---|
| diff `fade/c-pause-at-0.diff` | `2c8f3cef03a9` |
| served JS | `db7257e81859` |
| served CSS | `192f62c106d1` |

### 8. PR-029 rev 3: (a) on CM v1.2 (lead order 15:2xZ; posted 15:43Z)

The user's rev 2 note (13:06Z) was: "Waiting for arch-compositor-morph done, they might get new breakthrough." CM v1.2 landed on main at c7c19ae4 and was posted as PR-030.

**Branch.** `git rebase main` conflicted on fixes/end-morph-p1 (add/add), and `rebase -X ours` was refused by the permission check.
- Lead option 3: a fresh branch `fix/end-morph-f12-r3` from c7c19ae4, made in this same worktree, because a second worktree was refused by the isolation hook.
- Every commit of the old branch was cherry-picked except 140565f9, the one touching fixes/end-morph-p1. All 38 applied cleanly.
- The old branch `worktree-agent-aa06ada9c80534d32` stays at 9f17a505.

**Builds** (overlays gitignored; phone servers ran from snapshot copies in `out/fade/snap/cm` and `cma`):

| arm | how built | served JS | served CSS |
|---|---|---|---|
| CM v1.2 | `fix.mjs apply pf-cm --from compositor-morph` (main's patch.diff); pins match | `b9d2eceae44a` | `2948d49e47c6` |
| CM v1.2 + (a) | `patch -p4 -F0 < fade/a-pause-while-fading.diff`, no fuzz | `f1c1834e7d03` | `43d46a323a23` |

- The delta from CM v1.2 is `fade/a-on-cm12.diff` (`1d42b877a6cb`).

**Pixel gates** (`fixes/compositor-morph/gates/cm-px2.mjs`, PR-010 multi-pair, 430x775, 18 stops; output in `out/compositor-morph/px2-*-pf-cma-*`):
- **Chrome** (`--capture screencast`): 0 css px² consistent at every stop.
- **Simulator** (fw-sim, `sim.mjs session --functional`):
  - At "pre", 83 css px² (0.02 %) in css box 64-368 × 112-192. (a) is inert there (fade 1, no attribute), so this is load noise. The A/A pair at that stop also differs by 10 %.
  - From up0.5 to dn0.1, 13 css px² (0.003 %) in the nav logo box (css 80-112 × 16-48), which (a) never touches. This is the same Simulator noise as (c)'s 45 px².
  - 0 at every other stop. Everything is far under T2 (0.5 %).

**Phone check** (`phone/pfa-run.sh`, in its own hold, no block mark):
- Conditions: Xcode-induced Serious, battery 31.8 → 33.1 °C, no cooling wait. Shared jobs ran on the Mac beside it (load1 about 20).
- Each arm got 2 M runs (`__fwMorphDrive` hold 2000 × 3), in the order cm, cma, cma, cm. Then `phone/pfa-probe.mjs` ran per arm: a held synthetic touch, scrolled to m 0, 0.1, 0.3, 0.5 and 1 by the page-end formula.

| M run | >50 | >34 | ±4 twins (>46 / >54 / >30 / >38) | moving >50 | max |
|---|---|---|---|---|---|
| cm 1 | 3 | 6 | 3 / 3 / 8 / 3 | 2 | 68 ms (m 1) |
| cma 2 | 4 | 6 | 5 / 4 / 8 / 5 | 3 | 67 ms (m 1) |
| cma 3 | 4 | 6 | 5 / 4 / 7 / 6 | 2 | 67 ms (m 1) |
| cm 4 | 6 | 7 | 6 / 5 / 7 / 6 | 3 | 68 ms (m 1) |

- The ranges overlap at every threshold, so this is no worse and no gain (OBSERVED, 2 runs per arm).
- **Mechanism** (OBSERVED):
  - At all 5 positions the fade, opacity and blur are identical in both arms, e.g. fade 0.393, blur 7.28 px at the probe's m 0.3.
  - The probe's m runs ahead of the page's own (the phone's toolbar geometry), so its "m 0" already sits at fade 0.91.
  - cma is paused at every position. Running animations under #platform go 4 → 0; all animations on the page go 30 → 26, which includes CM's scroll-driven ones, and at m 1 go 8 → 4.

**Rev 3 answers.**
- Rev 1's Serious fade bug was in (b). (a) draws the fade exactly as CM v1.2 does (the phone values above), so whatever the user sees in A's fade, B shows the same.
- Rev 1's "try CM instead" and rev 2's "wait for CM" are both answered by building on PR-030.
- Rev 3 says in plain words that it depends on the user accepting PR-030.
- Try-it: A = `fixes/pf-cm/overlay`, B = `fixes/pf-cma/overlay`.

### 9. PR-029 rev 4 on v14: build and the P-162 card (written before any P-162 data)

The user's rev 3 note was "Do later after v10 best build land". v14 became the best build at 11:40Z on 2026-10-07 (P-161 PASS), and the lead ordered rev 4 on v14.

**Build.**
- v14 already holds (c): the pause attribute and `__pfP` at JS 14405-14419 (c3's cached S()), and the pause CSS at 5732-5735.
- So (a) on v14 changes one line in S(): `t === 0` becomes `t < 1`, plus a comment. The diff is `fade/a-on-v14.diff` (`4d6019dc6f8e`).
- The v14 overlay is copied read-only from P-161's frozen snapshot V (`agent-a69d59b114a666097/out/cm/snap163/V/`, two files, lead option 1). Its hashes were checked, and it is byte-identical to what the :5318 v14 server serves.
- arch-compositor-morph (c3b-d) and arch-end-fresh (S0/D1) were told the lines first; both confirmed there is no conflict.

| arm | overlay (gitignored) | JS | CSS |
|---|---|---|---|
| C = v14 | `fixes/pf-v14/overlay`, snapshot copy `out/fade/snap/v14` | `d23ee885d54f` | `4fafb83f1e72` |
| V = v14 + (a) | `fixes/pf-v14a/overlay`, snapshot copy `out/fade/snap/v14a` | `edd0f8897172` | `4fafb83f1e72` |

**P-162 card** (approved by the lead as ticket P-162; registered before any P-162 data)
- **Question:** on v14, does (a) pause #platform's shimmers through the whole fade (mechanism), and is the end morph no worse?
- **Arms:** C and V as in the table above. Plain http on the LAN, served from the snapshot copies.
- **Profile:** xcode-serious; no cooling wait; no heat pre-warm.
- **Hold:** `node tools/lock.mjs run iphone --owner fix-end-morph --block P-162 --max-seconds 900 -- sh fixes/end-morph-f12/phone/pfa14-run.sh <C port> <V port>`.
- **Gates first:** the phone is taken only after the Chrome screencast gate and the Simulator gate pass. The user goes first if they ask for the phone.
- **Driver and runs:**
  - M (`__fwMorphDrive`, hold 2000 ms × 3 cycles, std probe).
  - One uncounted warm-up run per arm (`--warmup`), C then V.
  - 4 counted runs in the order C V V C.
  - Then `phone/pfa-probe.mjs` per arm (C, V) at m 0, 0.1, 0.3, 0.5 and 1. This counts only; there is no timing.
- **Safari:** the kit has no thermal rearm or other wait between runs. Each run opens its page directly, and the exit trap parks Safari on every exit path (the kit-fix c181d248 rule).
- **Mechanism read:**
  - PASS if V has `paused` = true and #platform running animations = 0 at every probed position with fade < 1, while C has 4 there.
  - Fade, opacity and blur must also be identical between C and V at each position.
- **No-worse read:**
  - PASS if V's worse counted run is ≤ C's worse counted run + 2 at each of >50, >34 and morph-moving >50 (phone ms thresholds).
  - The ±4 ms twins (>46/>54, >30/>38) are reported. A verdict that differs between a threshold and its twin is "threshold-sensitive".
- **Pins:** `phone/pfa14-run.sh` `d2e10cba6c86`, `phone/pfa-probe.mjs` `98eb75aff529`, `fade/a-on-v14.diff` `4d6019dc6f8e`.
- **After the block:** `iphone.mjs park` (the trap does it), release, and the reads go to the lead.

**P-162 addendum 1 (lead, 12:0xZ on 2026-10-07; written before any counted P-162 data).**
- **Why:** the first start at 11:57Z stopped at the first warm-up's start gate. The phone read Nominal (battery 34.6 °C) because no Xcode condition was set. Nothing ran and nothing counted; the auto-posted step C-107 was cancelled by the lead. The user's standing rule (T-228 #15) is no manual Xcode thermal steps.
- **Profile:** "tool-serious" instead of xcode-serious.
  - Inside the hold the kit parks Safari, then runs `node tools/iphone.mjs rearm --owner fix-end-morph --settle 120`. rearm clears the condition, probes for a plain read, and starts the detached `thermal.mjs set serious`, which holds Serious. This is the same as fixes/compositor-morph's kits, c181d248.
  - `FW_PHONE_CONDITION=tool` makes every gate read the condition as ours.
  - A rearm exit other than 0 stops the block (exit 10) before any run.
  - The exit trap runs `thermal.mjs clear`, then parks Safari.
- **Hold:** `--max-seconds 1800` instead of 900, because the rearm settles 120 s and may wait up to its 600 s cap. The command is otherwise unchanged (`--block P-162`).
- **Unchanged:** arms, runs, order, reads and the probe.
- **Pin:** `phone/pfa14-run.sh` is now `dceed8fe0506` (was `d2e10cba6c86`). The restart begins from the first warm-up.

## Pending

- Done: the v9.2 Simulator pixel rerun before the zone and the step A rerun (both in `fixes/end-morph/README.md` section 5).
- P-152, the phone no-worse check (less-work rule):
  - Rev 1.1 waits for the lead's delta check and signature, then runs through the phone (reconnected, WDA ready).
  - Phone servers: `phone/p152-serve.sh`, on the copy of int-v8's snapshot.
