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

## Device check (Task 1, C vs Vc blind swipe)

Pending: see the lead's report (the swipe runner `fixes/v10/phone/v10-swipe.sh`, int-v8's, stopped at its fresh WDA
start, 17:52Z: XCTest "Timed out while enabling automation mode"; nothing was posted; re-run after the user's unlock).
