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

## Phone ticket S7: st6's gain at rest, on st6-rb2 (pre-data; prediction P-067)

**Owner:** `fix-scroll-engine` (st6). **Runner:** `iphone-runner`. **Order (lead, 2026-10-02 21:58Z):** after G2 and P-065, before F3.
This is a timing block. The user allowed it as an exception to the timing hold, for this fix only (T-027 #5).

**Question.** st6 removed the rotator's whole-view tick Layout on RB: slide-start view Layouts went from 71/71 to 1/36
(`fixes/rotator-st6/README.md`). In A1 the idle dt > 34 count was C 3, 2, 4 vs NB 0, 0, 0. Is that gain still there on
the current best build, st6-rb2, with the page at rest at the top? The control is the same build without st6.

**Arms.** Immutable copies (`chmod a-w`) in this worktree. From the main checkout:
`.claude/worktrees/agent-a1722cf5058e25591/out/st6t/snap/{C,V}`.

| arm | build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|---|
| C (control) | st6-rb2 − st6 = `fix.mjs combine st6-ctl user-bplus scene-scope` (RBi40pti: JS as on main, CSS = T-011's V) + shell-hold-c's CSS block (`out/st6t/hold-delta.diff`, S6 → HC, `patch -F0`) | `0144d2cd032a` | `add63ff17fb7` |
| V | **st6-rb2** (`fix.mjs apply st6-rb2`, as landed) | `7bf7c4657d21` | `f523598b2a24` |

- C → V differs only by rotator-st6's own lines plus the coupling selector. Checked line by line: JS +9 −5, which is
  exactly rotator-st6's JS. CSS +30 −2, which is rotator-st6's +27 −2 plus the coupling selector and its 2 comment lines.
- So the block measures st6, with its coupling, on the best build, and nothing else.
- C's rotator is the site's own: a keyed `{#if}` that swaps a 4-img and a 5-img block on each tick.

**Serve.** One server per arm, as for G2:
`node tools/serve.mjs --root site-pretty --overlay <snap>/<arm> --port 0 --https --vendors=local --latency 150 --no-cache --state …`.
The phone uses the plain-http twin (I-003). Check every served hash against the table before the block.

**Driver S**, the same in every run:
```sh
node tools/iphone.mjs run --driver scroll --probe std --idle 20 --owner iphone-runner --label S7-<n><arm> --arm <C|V> --build <C|st6-rb2> --run <n> --block S7 --low-power off
```
- Settle 8 s (the default), then a 20 s idle phase at the top, then the S scroll and a 3 s bottom phase.
- The rotator ticks about every 1.02 s: `f(800)`, slide start, `f(220)`, swap (JS 11575 loop). So 20 s gives about
  19 slide starts and 19 swaps per run.
- The page is not touched.

**Block** (protocol v2 §5, Timeline off, no recordings T-018):
1. Cool with `node tools/wait.mjs phone-temp --below auto` (≤ 10 min). Low Power Mode must be off. Park Safari.
2. Run one uncounted warm-up per port (`--warmup`): C, then V.
3. Run the opening heat check: one uncounted C run. It must reach bottom ≥ 58 fps and scroll ≥ 44 fps.
4. Run 8 counted runs: **C V V C C V V C**, `--run 1..8`.
5. Run the end heat check (C). Park Safari and stop the servers.
- Time: 12 runs at about 50 s, plus the opens, is about 15 min, plus cooling.

**Validity.** As in G2 and A1:
- Every counted C run must pass the sentinel bar. A failing control voids every run since the last passing one; cool,
  then restart the block.
- A run is void for a wrong served hash, Low Power Mode, a touched phone, or an attached inspector (§5.5).
- Log load1 and the battery temperature for every run. A quiet Mac is preferred but does not block the run. A
  LOAD > 8 run is flagged, not void.
- **Tick gate:** a run whose detected ticks are fewer than 0.8 × the expected count (idle s / 1.025 for starts) is left
  out of row 2 only.

**Scoring:** `python3 out/st6t/st6score.py <counted run files>` (sha256 `772ef9e0e8a4`, with the per-run separation; first version `7a8fed7fb4c3`; warm-ups are skipped).
- **Idle phase:** the frames inside `marks.idle`. Counts at > 50 and > 34, with twins > 46 / > 54 and > 30 / > 38;
  near-band frames listed.
- **Ticks**, inside the idle phase:
  - V: the class crossings on `div.start-selling-avatars`. `+is-sliding` is a start, `-is-sliding` a swap.
  - C: the mutation rows with childList ≥ 13 (the 4↔5 block swap is 15 nodes per tick in A1's RB runs, OBSERVED). A
    tick 150-400 ms after the previous one is a swap; any other is a start.
  - Per tick: the max dt over frames k − 1 to t + 260 ms, where k is the tick's frame.
- **Scroll:** dt > 50 and dt > 34 per run (guard and context).
- The scorer was checked on A1 (RB vs NB = RB + st6, 3 s idle):
  - idle > 34 sums C 9 vs NB 0;
  - tick frames > 34: C starts 7/9, swaps 3/6; NB 1/10;
  - per run C 3, 2, 4 vs NB 0, 0, 0 (separated);
  - verdict Gain, not threshold-sensitive.
- **The UI-process half of the FAIL rule is "not checked on the phone since T-018".** Main-thread FAIL is not read:
  S has no flinglog.

**Rows and decision** (fixed before data; sums over the 4 C and the 4 V runs):

| row | read | decision |
|---|---|---|
| **1. Idle (primary)** | idle dt > 34 per run, and idle dt > 50 sums | **Gain:** all three must hold: (a) **separated**: every V run's idle dt > 34 count is below every C run's; (b) V's > 34 sum is at least 2 below C's; (c) V's > 50 sum ≤ C's. If a twin flips the verdict, it is threshold-sensitive, and that counts as not Gain: > 30 / > 38 for (a) and (b), > 46 / > 54 for (c). Then the twin table is reported, not rounded. Otherwise **No gain**. |
| 2. Ticks | the share of starts and swaps with a frame > 34 (and > 50), per arm | Reported with row 1. It is the mechanism readout: C high, V near 0 is st6's signature. |
| 3. Guard | scroll dt > 50: per arm, the median over its 4 runs of each run's count | A V median more than 1 above C's median is a regression. Report it, with no landing claim. |
| 4. Context | scroll dt > 34, bottom and scroll fps | Reported only. |

- Gain with no regression: st6's at-rest gain is confirmed on st6-rb2, and the result goes to the lead.
- No gain: report to the lead. st6 stays on main, since it already landed with PR-003 A. The lead decides.

**Prediction P-067** (`fixes/PREDICTIONS.md`, committed before any data):
- Row 1 is Gain and not threshold-sensitive. C idle > 34 per run is 8-25 and V's is 0-2.
- Row 2: C's starts > 34 in ≥ 50 %, C's swaps in ≥ 25 %, V's ticks in ≤ 10 %.
- Row 3: no regression.
- Falsified if V's idle > 34 sum is above C's − 2, if any V run's idle > 34 count reaches the lowest C run's, or if C's ticks > 34 fall under 25 %.
- Amended before any data, at mgmt-ops-7's second read (2026-10-02 22:2xZ). Row 1 now needs per-run separation (a), not
  the 2-frame sum margin alone. Row 3 now names its statistic.
