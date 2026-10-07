# v11: Vc (v10 = v10 + CM + c1) + V13 + H1c, X2 slot off

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). The
> snapshots and deltas contain excerpts of Fastwork's code: local branches only, never push.

int-v11, on the lead's ruling of 2026-10-06 17:45Z (v10 = Vc). Built 17:54Z in a `--no-timing` chrome-measure hold;
gates 17:55-18:12Z in shared holds (counts and pixels only, nothing timed). The phone block (C vs v11, S1 sentinel at
the end) comes later, on the lead's go.

## Build card

```
BUILD v11 on Vc = v10 (v10 + CM + c1), snapshot out/v11/snap-9b4a829d15a0-62743920fe1a (HASHES.txt sha256/12 1704db6c4af6)
  arm  JS            CSS           what
  C    1b2eecc66011  e1359ab9994a  main's v9-final rev 7d (control; int-v8's out/v10/snap-a33a6c7c1f2b-62743920fe1a/C)
  Vc   b8b194b7ff56  62743920fe1a  v10 = V + c1 (int-v8's out/v10/snapc-b8b194b7ff56-62743920fe1a/V)
  V11  9b4a829d15a0  62743920fe1a  Vc + V13 + H1c = v11
  slot (not in the snapshot):
  V11X 71ad4f9b82ac  592d1f2a8af4  V11 + X2 (PR-031, the user's decision pending): built and checked in a temp copy only
inputs (pinned by build.sh): V a33a6c7c1f2b / 62743920fe1a (int-v8, HASHES dd33efddcece)
deltas (sha256/12 of the owners' bytes, on main):
  c1   fixes/v10/cm-c1.diff                     e7ec73c26c9c  (arch-compositor-morph, int-v8's normalised copy)
  V13  fixes/compositor-morph/v13-on-c1.diff    be94cbcf4ac0  (arch-compositor-morph), JS only, 4 hunks
  H1c  fixes/hero-covered-pause/patch.diff      db74aaf9e3c1  (fix-people-gpu), JS only, 6 hunks, made on V
  X2   fixes/people-gpu/patch.diff              24c2a1625316  (fix-people-gpu), JS + CSS, made on V
intermediate pins:
  Vc + V13         a769bb169c4a / 62743920fe1a  = arch's build
  V + H1c          784175f26a60 / 62743920fe1a  = fix-people-gpu's H1c build (H1c re-pinned: it applies on Vc and on
                                                  Vc + V13 with offsets only, no fuzz)
  Vc + H1c         7dfca6b4dbf8 / 62743920fe1a
  V + X2           9e66ff0696b4 / 592d1f2a8af4  = fix-people-gpu's X2 build
routes: R1 Vc + V13 + H1c = R2 V + H1c + c1 + V13 = R3 Vc + H1c + V13, byte for byte
code parity (fixes/v10/codeparity.mjs): every step of every route changed exactly its delta's lines (0 differences);
  Vc -> V11 against V13 + H1c: 0 differences; V11 -> V11X against X2: 0 differences (2 files)
node --check: V11 and V11X ok
served hashes: every gate load printed them (Vc b8b194b7ff56 / 62743920fe1a, V11 9b4a829d15a0 / 62743920fe1a)
X2 slot: off. On the lead's word that the user accepted PR-031: X2=on PIN_X=71ad4f9b82ac/592d1f2a8af4 adds arm V11X
  (snapshot out/v11/snap-9b4a829d15a0-62743920fe1a-x); its gates are not run yet
```

The build: `PIN_V11=9b4a829d15a0/62743920fe1a sh fixes/v11/build.sh` (`DRY=1`: all routes, parity and node --check on
temp copies, nothing written). The gates: `sh fixes/v11/gates.sh [px-cm px-hh sim-hh sim-cm sim-cold]` (`RUN=-r2`
suffixes the logs of a repeat).

## Gates (counts and pixels only)

### Pixels, Chrome (430x775 DPR 3)

| gate | where | result |
|---|---|---|
| `fixes/v10/gates/cm-px3.mjs --capture screencast`, A = Vc, V = V11, loads A V A2 V2 | 18 end-zone morph stops (pre, up0.02-up1, dn0.5/0.1/0) | consistent 0 at all 18 stops (identical); A~V beyond A/A 0 everywhere; 0 errors |
| `fixes/people-gpu/gates/hh-chrome.mjs`, A = A2 = Vc, H = V11 | People title, card covering the hero | covered pixels A~A2 / A~H / A2~H max level 0 / 0 / 0; H pauses exactly at the card's top edge (cardTop 0; running at 1-3 px), 4 animations held 5 s unchanged; at the top they resume from the held time (stroke-in 617 -> 617 ms, scroll-float 10016 -> 10016 ms); countdown label equal to A and A2 for 3 s; page end: H 0 running; 0 console errors |

### Simulator counts (fw-sim 15 Pro Max, Safari 26.5; one load per arm and session; Simulator ms never judged)

People title (`hh-sim.mjs`, 2 s windows at rest; layouts / paints). Run 1's Vc arm failed at `Timeline.start` (timeout)
and is not counted; run 2 has both arms:

| window | Vc (run 2) | V11 run 1 | V11 run 2 |
|---|---|---|---|
| top (hero shown) | 49 / 59 | 71 / 79 | 50 / 91 |
| **covered** (card 120 px past its top edge) | **54 / 71**, hero 9 running | **2 / 0**, 0 running 3 paused | **2 / 0**, 0 running 5 paused |
| page end (hero off screen) | 53 / 53 (1250x1250 roots) | 53 / 53 | 60 / 60 |
| top again | 110 / 125 | 81 / 89 | 64 / 76 |

- Covered: H1c's claim holds on v11 (fix-people-gpu on V: 65 -> 2 layouts, 74 -> 0 paints).
- Top windows vary with the accent word's phase in both arms (noise, as in fix-people-gpu's runs); page end: same kind
  in both (the CM corner clipper's 1250x1250 roots, F-321).

End of page (`cm-sim.mjs --stack 6`, 40-frame phases; paints / kpx / layouts, forced layouts / styles):

| phase | Vc run 1 | Vc run 2 | V11 run 1 | V11 run 2 |
|---|---|---|---|---|
| approach | 202 / 20432 / 105, f 69/24 | 204 / 20436 / 98, f 68/25 | 199 / 20314 / 102, f 67/26 | 204 / 20436 / 104, f 67/24 |
| open | 212 / 13537 / 139, **f 97**/70 | 180 / 11759 / 141, **f 96**/48 | 179 / 12579 / 135, **f 66**/49 | 189 / 13498 / 141, **f 68**/49 |
| restOpen | 38 / 750 / 27 | 49 / 761 / 39 | 49 / 761 / 39 | 43 / 755 / 33 |
| close | 113 / 13463 / 146, **f 104**/50 | 91 / 12169 / 121, **f 88**/52 | 84 / 11262 / 119, **f 52**/56 | 97 / 11715 / 114, **f 52**/64 |
| restClosed | 46 / 187 / 5 | 46 / 187 / 5 | 52 / 211 / 5 | 54 / 219 / 5 |

- V13's claim holds on v11: the 30-31 forced layouts per phase from `__msTick` (Vc JS 14307) are gone; forced layouts
  open 96-97 -> 66-68, close 88-104 -> 52. Total layouts stay about equal (open 139-141 vs 135-141): as arch found, the
  layout moves to `n`'s read (JS 13330 in Vc, 13427 in V11) instead of going away.
- restOpen (layouts 27-39 in both arms, all rooted at the morph's center column) is run-to-run noise: Vc 27 and 39,
  V11 39 and 33.
- restClosed: one running animation fewer in V11 (the hero's orbit, paused by H1c while the hero is off screen).

First open of the page load (`cm-sim.mjs --cold --stack 6`, one load each):

| | Vc | V11 |
|---|---|---|
| keyframes before the open (c1) | 39155 chars | 39155 chars |
| first three frames of the open (paints / kpx, layouts) | 12 / 1122k L5, 7 / 380k L5, 3 / 372k L4 | 4 / 392k L1, 14 / 1116k L6, 6 / 383k L5 |
| open phase | 184 / 12570 / 137, f 96/50 | 195 / 14031 / 134, f 67/48 |

- The first open is c1's (keyframes ready in both); V11's heavy frame comes one frame later, at the same size. No
  first-open change is claimed for V13 or H1c.
- Vc's cold restOpen fell back to closed (p 0) during the rest phase, so its cold rest and close rows are not compared.

## What is not claimed

- No timing: v11's phone block (C vs v11, driver G, enough C and Vc runs, a proper S1 sentinel at the end) waits for
  the lead's go. Less-work landing rule: V13 and H1c are less-work deltas (counts above + the short phone no-worse check).
- X2 is built only as a slot; its own gates and the user's PR-031 decision come first.
- Scenarios not run on v11: finger, toolbar resize, reload while covered, desktop.

## Blind swipe test, C vs v11 (lead 18:1xZ: v11 instead of Vc)

`fixes/v11/phone/v11-swipe.sh` is a credited copy of int-v8's `fixes/v10/phone/v10-swipe.sh` with only the arms changed
(C and V11 from the v11 snapshot, served by `fixes/v11/phone/v11-serve.sh`). It keeps the design: AB/BA pairs plus a
C/C catch pair, forced choice, each side recorded, a fresh WDA session and a 60 s settle first. Every step's meta carries
both pins. The first try (C vs Vc, int-v8's script, 17:52Z) stopped at the WDA start (XCTest "Timed out while enabling
automation mode") before anything was posted.

Result (answers 2026-10-07 00:20-00:32Z, ticket v11-swipe, key script `fixes/v11/phone/v11-swipe.sh` sha 60613d019ac0, the user
blind; order CC, AB, BA; scale 1-5):

| pair | step | page 1 / page 2 | pick | scale | scored |
|---|---|---|---|---|---|
| CC (catch) | C-092 | C / C | 2 | 1 | same (lead: the user's note asked for a "same" answer, which the kit did not offer then) |
| AB | C-093 | C / V11 | 2 = V11 | 5 | V11 |
| BA | C-094 | V11 / C | 1 = V11 | 5 | V11 |

v11 was picked in both real pairs at the top of the scale; the catch pair scored same. The user's notes on C-093 named a
look question at the end-of-page morph (the menu background looked more transparent for a moment while the finger held
still after a short move); it went to arch-compositor-morph with the records and the AB/BA timelines (lead's routing).
Since b13bbe7d the kit offers a third answer, "same" (`--options 1,2,same`).

## Phone block v11-nw (pre-staged; ran 2026-10-07 00:2x-03:02Z, result at the end of this section)

Kit: `fixes/v11/phone/nw11-{serve,hold,block}.sh` and `nw11-read.mjs`, credited copies of int-v8's v10cm-nw kit
(`fixes/v10/phone/nw-*`, itself fix-end-morph-p1's P-156 kit).

| | |
|---|---|
| question | v11 is no worse than C on the phone (less-work landing rule: V13 and H1c) |
| arms | C 1b2eecc66011 / e1359ab9994a; A = v11 9b4a829d15a0 / 62743920fe1a (from the v11 snapshot, HASHES 1704db6c4af6); B the plain baseline (thermal gate page) |
| driver | G: fs flicks (`fixes/morph-scroll/g-fastshort-v1.json`, compiled hash 8737f212c0ff), Timeline on in every counted run |
| profile | xcode-serious; ceiling 44 C / Critical at each hold's start and end gate |
| order | WC, WA (uncounted warm-ups), S0 (sentinel on C, Timeline off), counted EC1 EA1 EA2 EC2 EC3 EA3 EA4 EC4 (+ EC5), one counted run per 600 s chrome-measure `--no-timing` hold, TAIL (at most 2 re-runs), S1 on C in its own hold |
| part start | a fresh WDA session (stop, start, check), a 60 s settle (I-225), Safari parked and exactly one tab (I-227); a failure stops before any hold and goes to the lead for the user step; `NW_PREFLIGHT=<cmd>` swaps in ts-i227's preflight tool when it lands |
| cooling | as planned: none between holds; a hold VOID at a thermal gate: park, cool to <= 39.5 C (600 s at most), re-run the hold once; a second gate VOID or no cooling: BLOCK STOP. **Changed after H3, before any counted data (lead ruling 2026-10-07 ~00:55Z):** `NW_COOL=1`, park and cool to 38 C before every hold (two 600 s waits at most); the 39.5 C ceiling re-run stays; the state gate still decides validity |
| card change log | 00:33Z H1 WC VALID (40.3-40.9 C), H2 WA VALID (40.9-41.7 C); H3 S0 sentinel PASS (54.8 fps) but its end gate read Critical at 42.4 C (real ceiling): VOID; cooled to 39.3 C in 421 s; the H3 re-run's start gate read Critical at 39.0 C (I-225): BLOCK STOP. User re-armed the Xcode condition (C-095); the next preflight said AUTH after a USB re-attach (#126 -> #127, I-227; C-096). Resume from H3 with NW_COOL=1; H1 and H2 stand (uncounted warm-ups). 01:1xZ the resumed H3's start gate read Critical twice at a cool battery (35.4 and 34.8 C, Xcode condition Serious): BLOCK STOP; a stop + restart of the condition (C-097) and a check (preflight --settle 120 + profile) still read Critical at 34.5 C. Lead option (a), the agent waits: condition stopped (C-098 part 1, 01:26:56Z), plain reads with no condition 01:27Z Critical 34.1 C, 01:28Z Serious 34.1 C, 01:29Z Nominal 34.2 C; Serious restarted (C-099, 01:30:01Z); profile 01:30:19Z Serious (induced) 34.3 C; resumed from H3 at 01:30Z; every read in I-225. No counted run existed before the resume, so no data changed hands |
| read | `node fixes/v11/phone/nw11-read.mjs out/v11nw/runs --base v11` (the P-156 A-card reader rev 2 with base v11 and runs 1-5; predictions unchanged: first open, end zone no-worse, CB34) |

Dry run (`NW_DRY=1`, own folder, servers checked): all 13 holds DRY ok in three parts (H1-H6, H7-H11, H12 + TAIL ending in
S1), served hashes ok, fs and park30 programs at their pins (budget 229 s / 327 s), a two-counted-run hold refused, reader
selftest 40 checks ok, base check ok on the dry logs.

### v11-nw result (read 2026-10-07 03:0xZ)

`node fixes/v11/phone/nw11-read.mjs out/v11nw/runs --base v11`: base check ok on 13 hold logs; every hold VALID; S0 PASS
(56.5 fps, slow 0.025), S1 PASS (53.9 fps, slow 0.034); every counted run's start and end gate Serious (induced), battery
36.6-39.1 C. Counted runs: C 5 (EC1-EC5), A = v11 4 (EA1-EA4; the card's order has no EA5). Part B (park) was not in
this block, so Pr4 reads INSUFFICIENT by design.

**DECISION FAIL Pr1 (Pr4 not read).** Pr2 and Pr3 hold.

| per run | EC1 | EC2 | EC3 | EC4 | EC5 | EA1 | EA2 | EA3 | EA4 |
|---|---|---|---|---|---|---|---|---|---|
| end zone frames (n) | 1437 | 1423 | 1450 | 1397 | 1403 | 1468 | 1483 | 1467 | 1492 |
| end zone >34 ms | 24 | 31 | 20 | 33 | 41 | 23 | 18 | 26 | 19 |
| end zone >50 ms | 5 | 6 | 3 | 8 | 12 | 2 | 1 | 6 | 0 |
| CB34 / CB50 | 1 / 0 | 2 / 0 | 0 / 0 | 7 / 3 | 1 / 0 | 3 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| first open f1 / f2 / f3 ms | 16 / 30 / 16 | 16 / 26 / 19 | 17 / 30 / 15 | 17 / 25 / 19 | 17 / 30 / 18 | 17 / 46 / 11 | 17 / 45 / 14 | 17 / 50 / 12 | 17 / 44 / 11 |
| first open f123 ms | 62 | 61 | 62 | 61 | 65 | 74 | 76 | 79 | 72 |

| prediction | bound | C median (range) | v11 median (range) | A - C | verdict |
|---|---|---|---|---|---|
| Pr1 first open O1.f2 | <= +4 ms | 30 (25-30) | 45.5 (44-50) | **+15.5** | FAILS, runs fully separated |
| (f123, descriptive) | | 62 (61-65) | 75 (72-79) | +13 | not paid back by f3 |
| Pr2 end zone no-worse | P-153 rule | | | | holds (NO-WORSE PASS, not threshold-sensitive) |
| end zone >50 ms (goal 0) | | 6 (3-12) | 1.5 (0-6) | -4.5 | descriptive |
| end zone >34 ms | | 31 (20-41) | 21 (18-26) | -10 | descriptive |
| Pr3 CB34 | <= +3 | 1 (0-7) | 0 (0-3) | -1 | holds |
| Pr4 park | | | | | INSUFFICIENT (no part B) |

- The first-open frame is in the near band of the >50 goal in v11 (44-50 ms; EA3 50 counts at the >46 twin, none over
  50); C's is 25-30 ms.
- Vc's only first open on the phone (v10cm-nw ED1, fixes/v10/README.md, n 1): f2 46 ms, f123 73, busy 23 ms; V (CM
  without c1): 75-77 ms, busy 45. v11's 44-50 ms with busy 22-26 ms equals Vc's, so V13 and H1c add nothing measurable
  to the first open (OBSERVED, Vc n 1).
- Census (250 px bins, frame counts, decides nothing): worse bins 750-1000, 3000-3500, 4250-4500, 5000-5500.

**O1 attribution** (`node fixes/end-morph-p1/phone/o1-attr.mjs out/v11nw/runs`, the block's own Timeline,
maxCallStackDepth 1, so record types, not functions; runs 1-4 per arm; medians, ms clipped to the gap):

| record | f2 C | f2 v11 | f3 C | f3 v11 |
|---|---|---|---|---|
| gap dt | 28 | 45.5 | 17.5 | 11.5 |
| FireAnimationFrame (script in rAF) | 9.1 | **20.9** | 3.55 | 4.6 |
| FunctionCall | 9.3 | **21.15** | 3.7 | 4.6 |
| RecalculateStyles | 2.85 | 5.95 | 2.15 | 4.1 |
| Layout | 2.6 | 2.45 | 0.7 | 0.1 |
| Composite | 13.65 | 19.8 | 10.4 | 2.25 |
| Paint | 0.95 | 0.8 | 0.95 | 0.1 |

- Composite moves, as in P-156: f2 + f3 is C 24.05, v11 22.05 ms.
- What v11 adds is script in the first open's animation frame (+11.8 ms) and style (+3.1 ms in f2, +1.9 in f3).
- **Cause candidate (UNRESOLVED; record types only, no function names):** `__cmPrep` runs in the first open's rAF (V11
  JS 14618-14641) and calls `__cmGen()` unconditionally. `__cmGen` rebuilds the whole keyframe text (~39 KB, every key
  over its frame grid through `__cmVals`) before it compares the result with `__cmCss` and returns. So when c1
  (`__cmWarm`) has already generated and injected the keyframes, the open frame still pays the full string build.
  Next to it are `__cmEls()` (querySelector per part) and one `setProperty` per part and property. The style part is
  the class flip onto the 39 KB of keyframes on scroll timelines.
- Did c1 run before the first fling? Not observed on the phone (no marker). The fs program leaves 4.7 s still between
  page ready and the first touch (every run, 4.70-4.72 s), and c1 arms 2 s after mount and needs 300 ms without scroll,
  the panel mounted and the ResizeObserver's size, so it should have. The Simulator's cold run had the 39155-char
  keyframes in place before the open in Vc and V11 alike (Gates, "First open").
- The decisive checks (Chrome call tree and Simulator) and the proposed delta go to the lead first. No new phone block
  runs without the lead's OK. **Status:** v11 does not become the best build on this result (lead, 03:0xZ).

### First open in Chrome: call tree, C vs V11 (lead OK 03:1xZ; attribution only)

`node fixes/v11/first-open.mjs --cold --arm <A>=out/v11/snap-9b4a829d15a0-62743920fe1a/<A>`: a credited copy of
fix-end-morph-p1's `fixes/end-morph-p1/p1b/first-open.mjs`, which adds the c1 check (`#fw-cm-kf` before open1) and prints
the per-frame self samples and FunctionCall owners. Each arm ran in one shared probe job (CPU 6x, 430x775, the open is the
first morph after load). The Vc arm did not run: it was left in the queue to protect P-158 and comes after it. ms are at
6x, main thread; no verdict is drawn from them.

- c1 ran before the open: V11's `#fw-cm-kf` held 39119 chars before open1.
- The heavy frame is open1 frame 1 (the phone's O1.f2):

| open1 frame 1 | C | V11 |
|---|---|---|
| span | 30.0 | 92.6 |
| FireAnimationFrame / FunctionCall | 19.5 / 21.0 | 72.7 / 75.0 |
| FunctionCall `iE` (JS 2706, the scroll engine's rAF: runs the registered callbacks, the morph tick among them) | 3.6 | 44.3 |
| FunctionCall: the tick's queued microtask (JS 14435 in V11, 14321 in C; it calls the nav hit test F()) | 13.0 | 25.3 |
| forced style in F() (`getBoundingClientRect`, JS 13962) | 196 els, 7.0 | 206 els, 15.4 |
| forced layout in F() | 9/1011 dirty, 1.5 | 421/1021 dirty, 5.2 |
| Paint | 4.5 | 34.9 |

- F() and its forced style and layout run in the tick's microtask, a FunctionCall of its own, so they are not inside
  `iE`.
- Inside `iE` (the tick, `__cmSet`, `__cmPrep`) the self samples name the keyframe and value builders: `q` 14504,
  `__cmVals` 14490, the anonymous functions at 14513/14535/14585, `px`, `lin`, about 6.9 ms together. C has none of
  them. `__cmPrep` calls `__cmGen()` on every open from closed, and `__cmGen` rebuilds the whole text before it compares
  it with `__cmCss`.
- The rest of `iE`'s 44.3 ms is not attributed. The saved data are the top-12 self samples per frame (their sum is far
  below the FunctionCall time at 6x), no inclusive tree, and `iE` has no forced style or layout record of its own. A
  re-run that saves the frame's inclusive tree names it (after P-158).
- Chrome pays this on every open from closed: V11's open2 frame 1 is 83.9 ms (Paint 27.5, style 17.7, layout 421 dirty),
  against C's 24.1. On the phone the only repeat full open after a full close (EA2) took 21 ms (C 13-22). So Safari's
  extra looks first-only (OBSERVED, n 1). The Simulator call-stack run checks that after P-158.
- c2 brief to arch-compositor-morph (lead 03:4xZ):
  - (i) memoize `__cmGen` on its inputs, so `__cmPrep` skips the rebuild after c1;
  - (ii) keep F()'s read out of the open's first frame on the CM path;
  - (iii) a c1 extension for the first-only part, which waits on the Simulator run.
