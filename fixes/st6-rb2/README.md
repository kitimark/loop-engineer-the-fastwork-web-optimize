# st6-rb2: the best build restacked from the patches on main (HC with RB replaced by RBi40pti)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

Owner: `fix-scene-scope` (restack assigned by the lead after scene-scope landed as 1ce70e8, 2026-10-02).
**Status:** checked by mechanism and pixels (lead option (a), 2026-10-02). Ready to land.

**What it is, plainly:** st6-rb2 = HC (shell-hold-c, C1's measured build) with RB replaced by RBi40pti.
- RBi40pti over RB is confirmed on the phone (T-011, `fixes/scene-scope/README.md` "T-011 result").
- shell-hold-c over st6-rb is confirmed on the phone (C1, `fixes/shell-hold-c/README.md`).
- **The stack itself was not timed on the phone as a stack.** It is accepted by mechanism (Simulator) and pixels
  (Chrome headless), below. No Chrome timing A/B either (deferred per the user's direction).

## Build

```sh
node tools/fix.mjs combine st6-rb2 user-bplus scene-scope rotator-st6   # 0 conflicts, no fuzz
# 1. the coupling selector, by hand, in fixes/st6-rb2/overlay/_app/immutable/assets/2.gBuqKVzi.css (as in st6-rb):
#    .start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img,
#    (same place, last entry before `.start-selling [data-fw-wc="0"]`, same comment)
# 2. shell-hold-c's delta over st6-rb (the keyframes block + rule at the CSS end), applied with patch -F0
node tools/fix.mjs diff st6-rb2      # patch.diff: the full build from the baseline
node tools/fix.mjs apply st6-rb2     # rebuild the overlay from patch.diff
```

| build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|
| S6 = st6-rb (RB + st6 + coupling), measured in A1 / C1 | `59b23b3f57fd` | `d22542d0b5f8` |
| HC = shell-hold-c (S6 + shrink hold), measured in C1 | `59b23b3f57fd` | `a3b34c3a3920` |
| **st6-rb2** = HC with RB replaced by RBi40pti | `7bf7c4657d21` | `f523598b2a24` |

The S6 and HC overlays rebuilt from their committed `patch.diff`s give the measured hashes above.

## Code difference from the measured builds (content lines, `diff`)

- **st6-rb2 vs HC**, the only non-comment differences:
  - CSS: 40 selector lines removed, the 36 + 4 `.start-selling [data-start-selling-scene="paused"] .start-selling-platform-*`
    entries. They are byte-identical to RB → RBi40pti as measured in T-011 (CSS 0d7dfc79e703 → 10cf34974e67).
  - JS: one code line, PMsweepGate line 3982 (`data-sweep-paused` set on each row title before `PMsweepIO.observe`).
  - Plus 4 comment lines above that JS line. Two of them differ from the T-011 build (the status words updated after
    T-011; comment only).
  - Nothing else: the coupling selector and the shell-hold rule are byte-identical to HC.
- **st6-rb2 vs S6:** the same, plus shell-hold-c's block.

**F-129's two spots** (`avatars +is-sliding`, `commission +entering`: more 32-44 ms frames with HC in C1): **the restack
changes no code at either spot.** Every changed CSS line is a #platform-scene selector, and the JS line is the #platform
row-title gate. The avatar coupling and the #people shell rule are unchanged. Not measured here (lead).

## Checks (functional shared lane, no timing; hold script `out/scene-scope/restack/hold.sh`)

Arms were served from immutable copies (`out/scene-scope/snap3/{HC,NEW}`, `chmod a-w`) on fresh ports with `--no-cache`.
Served hashes were checked at the start of every hold. HCb = the HC files on a second server (A/A).

| check | tool | result |
|---|---|---|
| `fix.mjs check st6-rb2` (11:34Z) | headless mobile vs baseline | **CHECK OK**: morph reached, 0 errors, 0 4xx; pixel diff vs baseline top 0.14 %, middle 0.01 %, bottom 0.54 % |
| pixels at 430x932 DPR 3, frozen clock (every timer cleared, every animation paused at 1000 ms), 3 loads per arm interleaved HC NEW HCb (`checka2.mjs`, wi-stack's, unchanged), 11:38-11:41Z | top (y 0) | A/B 0.062-1.272 %, A/A (HC~HC, NEW~NEW, HCb~HCb) 0.141-1.249 %, HC~HCb 0.06-1.257 %. Pairs from the same round: HC~NEW 0.062-0.083 %, HC~HCb 0.06-0.194 %. **0 px on the avatar imgs** in every pair. Every differing box lies in the hero area (x 68-375, y 242-449 CSS px), in A/A and A/B alike. |
| same, y 4000 (paused scenes; #platform starts in view) | | **0 px in all 36 pairs** |
| pixels at 1440x900, same procedure, 11:41-11:44Z | top | A/B 0.041-0.889 %, A/A 0.049-0.886 %. 0 px on the avatars. |
| same, y 4000 | | 0-0.001 % in every pair, A/A and A/B alike |

**Pixels: pass.** A/B is inside the A/A at both widths and both positions.

**Simulator session** (one cold-booting `sim.mjs session --functional`, 11:38:08-11:42:21Z, before G2's counted phone runs
(I-063); iphone-runner was told when it ended). Beside it on the Mac: my own pixel jobs (430 from 11:38:11, 1440 from 11:41:22; `holds.log`), load1 12.8 at
start. This holds structure only; Simulator ms are never a verdict.

1. **#people shell hold (shell-hold-c's spot (c))**: `layers.mjs` (wi-stack's, unchanged), step-scroll, LayerTree after
   each step, HC then NEW.

   | arm | at `#people +is-future-shrinking` (y 1741-1744) |
   |---|---|
   | HC | 127 layers, **115 MB**; the 4 non-active shell layers removed |
   | st6-rb2 | 127 layers, **115 MB**; the 4 non-active shell layers removed |

   The two arms are the same. For reference, S6 without the hold had 162 MB there (wi-stack's `s4` Simulator run). **The hold is in effect in st6-rb2, as in HC.**

2. **#platform switch (RBi40pti)**: `srwin-sim.mjs` (W driver, Timeline depth 10), runs HC1 NEW2 NEW3 HC4, scored with
   `SW=2500-2760 rsstat.mjs` as in T-011.

   | run | switch y | RS ms | view-rooted nested Layouts | Layout >= 2 ms in the window after the RS |
   |---|---|---|---|---|
   | HC1 | 2618 | 23.3 | 1 (VIEW 21.1; + 390x312 0.2) | 0 (one 104x32 0.3 ms, not view-rooted) |
   | NEW2 | 2607 | 0.4 | **0** | 0 |
   | NEW3 | 2609 | 0.6 | **0** | 0 |
   | HC4 | 2611 | 22.8 | 1 (VIEW 21.2; + 390x312 0.1) | 0 |

   This is the pattern T-011 showed on the phone: the control has one view-rooted nested Layout at the switch, the
   variant none, and nothing follows the RS. **RBi40pti's mechanism
   is intact on top of st6 + shell-hold-c.**

3. One note, OBSERVED (Simulator, n = 1):
   - NEW3 had a 102 ms frame at y 1911 (in #people, after the shrink start).
   - Its RenderingFrame (120.8 ms) holds no main-thread record of 2 ms or more except a Composite of 18.7 ms. So about
     100 ms is unattributed: in our setup, cause unknown.
   - The run shared the Mac with my own headless Chrome pixel job.
   - NEW2 had no frame above 22 ms in y 1700-2200, nor did HC1 or HC4 (17 and 21 ms).
   - Simulator timing beside other jobs decides nothing. The layer state at the shrink matches HC, and the code at #people
     is byte-identical to HC.

## Not done here

- No phone block and no timing of the stack (lead option (a)). The F-129 keys are not measured.
- Not re-run on this stack: tap, toolbar resize, rubber band (none were run on RBi40pti or HC either).
