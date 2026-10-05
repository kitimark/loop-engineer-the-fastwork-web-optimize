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

## P-152: phone no-worse check (card, registered before any P-152 data)

**Ticket:** P-152 (lead, 2026-10-05; registered by mgmt-clerk-1). Stage V of a less-work fix (memory
"less-work-landing-rule"): cost-card counts (above) plus one short phone no-worse check. No gain is claimed from the
phone.

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
- At most 2 blocks.

| part | holds (each a 600 s chrome-measure `--no-timing` hold, 2 runs at most) |
|---|---|
| 1 | H1 WC WV, H2 S0 EC1, H3 EV1 EV2 |
| 2 | H4 EC2 EC3, H5 EV3 EV4, H6 EC4, H7 TAIL (re-runs, then S1), HA AC1 AV1 |

**Runner steps (lead condition 6).**
- `p152-block.sh` starts every part with `iphone.mjs wda stop`, `wda start`, `wda check` (the I-212 lesson), and stops
  the part if WDA is not READY. Each hold also runs `wda check` before its start gate.
- Safari is parked after every run and at the end of every part.
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

**Decision (lead condition 3; P-150 rev 1.1's rule).** V is judged against C, at >34 and at >50 separately.
- WORSE when EITHER:
  - (a) min(V) > max(C); OR
  - (b) median(V) - median(C) > +2 at >34, or > +1 at >50.
- Rates are used instead of counts when median n differs by more than 15 % between the arms; the bounds then become 2
  and 1 divided by median n(C).
- Twins: >30 and >38 use the >34 bound; >46 and >54 use the >50 bound. A twin that disagrees with its main threshold
  marks the result "threshold-sensitive".
- NO-WORSE PASS: neither >34 nor >50 is WORSE. FAIL: either is WORSE; it goes to the lead (block 2 or no landing).
- INSUFFICIENT: an arm has fewer than 3 valid runs. VOID: a sentinel failed.
- "Position-confounded" is added when the lowest V run at a failing threshold opens its hold (EV1, EV3). It is a label
  only and doesn't change the outcome.
- The scorer's self-test (`node fixes/end-morph-f12/phone/p152-read.mjs --selftest`, 18 checks) covers each clause
  alone, both together, both thresholds, the 3-run floor for each arm, the rates switch, the twin flag, the
  position label, the end-zone filter and the attribution split.

**Falsification line (lead condition 4).**
- Prediction: NO-WORSE PASS. F1 hides #platform only at m >= 0.55, where it is already at opacity 0. U2 removes hit
  tests.
- The named risk: F1's return-frame restyle could add a slow frame at each open and close. That restyle is +164-171
  styled elements and +24 dirty layout objects in Chrome, and Simulator style recalcs went 78 against 60-62 in open.
  If it does, (b) catches it at >34 or >50 as a median rise of 1-2 or more per run (each run has several opens and
  closes).
- A FAIL means the fix does not land as is. The next step would then be a version that keeps #platform hidden without
  the restyle (for example, hiding only #platform's composited children).

**Attribution (lead condition 5; decides nothing).**
- AC1 and AV1 run after S1, Timeline on.
- Read: Paint records per moving frame, split at m >= 0.55 (F1's range) and 0 <= m < 0.55, with m from scrollY and
  innerHeight (Chrome geometry; an approximation on the phone).
- Expectation: fewer Paint records per frame at m >= 0.55 on V, from the toolbar-step repaints of #platform that P-137
  showed. Never a gate.

**Power note (OBSERVED, for the reader).** P-137's C arm (v9-final + 7d, same script and profile, 4 runs) had 25-40
end-zone frames over 34 ms per run and 1-15 over 50 ms. Against that spread, a median bound of +2 / +1 can fail by
chance. The rule is the lead's and stays as written. A FAIL is read together with the separation clause and the twin
flag.

**Kit (pins, sha256/12, at the card commit).**

| file | pin |
|---|---|
| `phone/p152-block.sh` | `3a2d0a7716c7` |
| `phone/p152-hold.sh` | `b5b38c853340` |
| `phone/p152-serve.sh` | `2548d4588b0e` |
| `phone/p152-read.mjs` | `005136ea3002` |

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
- Reader smoke test: on P-137's own records (fix-end-bg's out/p137/runs: a different question, used only to test
  parsing), the reader read all 8 counted runs and both sentinels, and the attribution read gave plausible splits
  (EC1: 719 frames at m >= 0.55, 675 below).

## Pending

- v9.2 Simulator pixel rerun before the zone (informational now; on v9-final that stop is 0).
- Step A rerun (toolbar strokes in the Simulator, fixed layer matching).
- Phone no-worse check (less-work rule), through the lead. The iPhone is disconnected (T-207); the lead posts the
  reconnect step. Phone servers: int-v8's `fixes/end-morph-v9f/serve.sh` on the same snapshot.
