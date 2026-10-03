# Fix: mw10e-arm-scope-c (F3, comment re-cut: the landing build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** landing build for F3 (lead 15:0xZ). The code is token-identical to `mw10e-arm-scope`; only comments
changed. Measured evidence is in `fixes/mw10e-arm-scope/README.md` and `results.json`. P-036 (G), F and review run on
this build.
**Base:** stacked on `aw1-10e` (`node tools/fix.mjs apply mw10e-arm-scope-c --on aw1-10e`). JS only.

## What changed vs mw10e-arm-scope

The two patch comments are reworded to what the sources support:
- **Removed:** the touch-region argument (F-055, REFUTED for iOS 26.6, F-070), and "every wheel/touch listener
  add/remove on the window invalidates the ROOT style".
- **New wording:**
  - the window wheel listener triggers a full style rebuild only when the set of event-region types changes
    (WebKit source, arch-claims, tag 7624.4.5);
  - touch event regions are compiled out on iOS before WebKit 7625;
  - the ~100 ms frame follows the listener add (observed);
  - which listener costs it is unresolved (F-062).

## Token-identical check

The check strips every full-line `//` comment from both files and compares the rest byte for byte. No line changed
outside full-line comments. `node --check` passes.

| | sha256 |
|---|---|
| mw10e-arm-scope (measured) `2.DyWL8TcE.js` | `7b0d6222554580061903a5ccc405489f94cca3a6d5031cb26efa9e50287b6d5f` |
| mw10e-arm-scope-c (landing) `2.DyWL8TcE.js` | `c6d3590576a7a6326a101d35894b16c4735847f15b72a856ee67bb7e23d307d7` |
| both, comments stripped | `13d36da9308ea6a274bee2f256584c6e0bf56742226a847179db2c880e3fea23` (identical) |

- The comment-stripped diff is empty. Full-line comment lines: 75 in both.
- So the phone evidence (P4 block B, P-022 HIT) and the Chrome regression A/B of `mw10e-arm-scope` carry over to
  this build.
- CSS = base (c6aad94b455f).
- Immutable snapshot copy for the phone: the worktree's `out/snapshots/mw10e-arm-scope-c-c6d3590576a7/` (read-only,
  serve with `--overlay <it>,fixes/aw1-10e/overlay`).
  For P-036 the control is an immutable copy too: `out/snapshots/aw1-10e-3e2f599a1632/` (JS 3e2f599a1632, CSS
  c6aad94b455f). V is served as `--overlay <V copy>,<C copy>`. The served hashes of both arms were checked over http
  (22:01Z).

## P-036 Simulator script check (counts only, before any phone data)

Setup: one run per arm, arm-scope-touch-v1 under compiler v2 (d72ee13644cc), iOS 26.5 Simulator (iPhone 15 Pro Max),
from the immutable copies, 2026-10-02 22:1xZ. The Simulator is exempt from the fidelity gate. Its times are not
results, so only counts are given here.

- Both runs are valid under the registered void rules.
  - Strokes: C 18, V 27, all aligned with the touch sequences.
  - Scored strokes per zone: Z1 4, Z2 4, Z3 3 in both arms.
  - Zone start y stays inside the bands (Z1 0-810, Z2 C 2482-3292 / V 2490-3300, Z3 4032-4580), and every transit loop
    up to Z3 ended on its target.
  - V's last Z2 stroke started at exactly 3300, the band cap. A phone run whose last Z2 stroke starts above it keeps 3
    scored Z2 strokes, still >= 3.
- **The end transit loop can run to its 10-pass cap.**
  - V settled at y 5212, 8 px short of C's 5220. Its later end strokes were all prevented (morph armed), so
    `atEnd` never came true and the loop stopped at the cap: 9 extra strokes.
  - These strokes are transit/end and are not scored. They add about 8 s to a run.
- **First touchmove cancelable, share of zone strokes:**

  | zone | C | V |
  |---|---|---|
  | Z1 | 0/4 | 4/4 |
  | Z2 | 4/4 | 4/4 |
  | Z3 | 3/3 | 3/3 |

  - Simulator only: OBSERVED. It matches the source note above: touch event regions are compiled out on iOS before
    WebKit 7625.
  - So V's non-passive touchmove on #platform and the nav, armed at load, makes every touch on the page dispatch
    cancelably, not only touches on those subtrees.
  - The P-036 row's zone premise ("Z1: no non-passive listener under the finger in either arm"; "Z2: V none") holds
    for listener targets but not for dispatch. In Z1, V now waits on the first touchmove's main-thread round trip
    (C1, claims-audit §2.9) and C does not. In Z2 both arms wait.
  - Revised expectation, registered before any data, with the rule unchanged:
    - Z1: V may be FLAGGED or WORSE (a round trip on a hero-busy main thread).
    - Z2: overlap, no longer "V better or overlap".
    - Z3: overlap.
  - The decision rule stands: a SEPARATED-WORSE zone means F3 does not land as is.

## P-036 heat check: why hero-none fails, and the proposed replacement (2026-10-02 23:4xZ, before any counted data)

The opening heat check (hero-none on the pacing v3 page, G driver, v3-gesture.json v2 hash f2cef11cb363) failed 3 times
in 3 records. The block stopped under the stop rule, and no counted run exists. Derived numbers:

| record | battery | Mac load1 | origin | moving frames | p50 / p95 ms | moving > 20 ms |
|---|---|---|---|---|---|---|
| first attempt, opening check | 37.8 °C | 18 to 7.6 | cold (Safari restarted) | 608 | 17 / 29 | ~30 % |
| warm-up (uncounted) | 38.0 °C | 5.9 | cold port | 601 | 17 / 30 | ~29 % |
| re-run, opening check | 37.5 °C | 4.8 | warm | 604 | 17 / 29 | 29 % |

What it is not:
- **Not heat.**
  - The three distributions are almost identical across 37.5-38.0 °C, Mac load1 4.8-18 and a cold or warm origin.
  - The same evening the same phone passed all 17 of its sentinel and control checks in G2, P-065 and the st6 block,
    with 0 failures, at 36.4-41.5 °C. Those are the standard S/W checks: bottom >= 58 fps and scroll >= 44 fps.
- **Not the page or its copy.** v3.html, v3.js, v3.css and v3-gesture.json are unchanged since 4794919, the commit
  P-035 registered. hero-none has no other record: the P-035 G block never ran (it waited for I-042), so this check
  has never passed on any run.
- **Not the toolbar.** The toolbar collapses once per run (775 to 815, ~4 s). Only 2 of the ~22 moving frames with an
  innerHeight change are over 20 ms.
- **Not the finger phase alone.** Gaps over 20 ms come in equal shares with the finger down (88 of 295) and in the
  momentum after lift (85 of 287).

What it is (OBSERVED, in our setup, cause unknown):
- Under the G driver, moving rAF gaps on this phone fall into clusters of 12-13, 16-17, ~25 and ~29 ms.
- During the slow drags they run in repeating pairs such as 29+13 or 25+25 ms.
- The fastwork arms show the same clusters under the same driver: the warm-ups and the void runs, moving p95 37-42 ms.
- This fits F-071 (G/F runs carry 12-13 ms stretches, trigger UNRESOLVED; fps and frame counts from F/G runs don't
  compare with S/W/M runs).
- A p95 <= 18 ms rule assumes a steady 16.7 ms cadence. That holds for scripted S/W/M runs, not for G runs. So
  hero-none under G cannot tell heat apart: it fails at any temperature.
- No platform claim is made here. The proposal below does not rest on why the cadence is irregular.

**Proposed amendment (needs the lead's signature before any data):**
- Replace the hero-none G sentinel with the protocol's standard S sentinel (CLAUDE.md "Phone blocks"):
  `iphone.mjs scroll` on the C build at its own port, uncounted. It passes when bottom >= 58 fps and scroll >= 44 fps.
- It runs after the two warm-ups and again after C4.
- A failing S sentinel voids every counted run since the last pass. The phone then cools per §5.3: 0.5 °C below the
  last passing sentinel, at most 10 min.
- Everything else is unchanged: arms, script hash d72ee13644cc, order C V V C C V V C, void rules, scoring, decision
  rule, quiet Mac, and the stop rule.
- The stop rule now applies to the S sentinel: if it fails on a cool phone and a quiet Mac, the block stops.

The lead signed this amendment at 23:58Z (S sentinel on C, after the warm-ups and after C4).

## P-036 result (G driver, 2026-10-03 00:28-01:10Z): card part PASS, every zone overlaps

Run by iphone-runner on the signed plan, from the immutable copies (served hashes: C JS 3e2f599a1632, V JS
c6d3590576a7, CSS c6aad94b455f). Script arm-scope-touch-v1, compiler v2 hash d72ee13644cc. Tools at main df0e21f,
no rebase mid-block. Low Power Mode off. Scored by fix-nav-morph with the registered scorer. Derived numbers only:
no gesture record is committed (N1).

**Block validity**
- Order C1 V1 | V2 C2 C3 V3 | V4 C4, i.e. C V V C C V V C. The bars mark the 3 holds, each in the runner's own
  `--no-timing` hold. One uncounted warm-up per port (wC, wV) came first.
- **Sentinels:** S-open PASS (bottom 60, scroll 58.9 fps, 38.9 °C). S-end PASS (bottom 60.2, scroll 57.1 fps,
  40.7 °C). Both pass, so no counted run is voided.
- **Counted runs:** all 8 are valid. Every zone has its 3-4 scored strokes, stroke maps and touch sequences agree,
  and no timestamp was out of order.
- **C2 was re-run in place.** The first C2 was killed at stroke 7 of 16 by the runner's job time limit (not a page
  or phone fault). It is void and kept apart; the re-run kept the order.
- **The runner's deviations, all disclosed in its run log:**
  - **Heat:** Safari sat unparked for ~6 min between holds 1 and 2, so V2 ran on the hottest phone of the block
    (42.6 to 43.3 °C). Every other counted run ran at 38.7-40.7 °C.
  - **Mac load:** V2 and V4 started at load1 20 and 26. Those were decaying averages left by an earlier group of
    shared jobs; load1 was 2.3-4.5 inside the holds.

**Registered metric:** median touch-to-scroll per zone per run, in ms.

| zone | C1 | C2 | C3 | C4 | V1 | V2 | V3 | V4 | med C | med V | V-C | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Z1 (< 1900) | 201 | 193 | 200.5 | 192.5 | 192.5 | 208.5 | 191.5 | 190 | 196.8 | 192 | -4.7 | overlap |
| Z2 (2100-3300) | 192.5 | 193.5 | 191 | 194 | 192.5 | 196.5 | 191 | 196.5 | 193 | 194.5 | +1.5 | overlap |
| Z3 (>= 3800) | 190 | 187 | 188 | 192 | 191 | 186 | 187 | 193 | 189 | 189 | 0 | overlap |

- No zone is SEPARATED-WORSE, BETTER or FLAGGED. In no zone are one arm's runs all above the other's.
- Without V2, the hot run, Z1 is still overlap: V 190-192.5 against C 192.5-201, which touch at 192.5. Every other
  zone is unchanged.
- The ~190 ms level is the same in both arms. It is the G driver's touch-down-to-first-scroll path, not the page.

**Info only, not part of the card**
- **First touchmove cancelable** (share of zone strokes, every run): Z1 C 0/4 vs V 4/4; Z2 and Z3 all strokes in
  both arms. The phone shows the same dispatch effect as the Simulator check above (OBSERVED, in our setup).
- **No cost from that cancelable dispatch in Z1.** Queue delay (median per run) is 14.5-17 ms in C and 15-17 ms in
  V. Z1 touch-to-scroll is not higher in V.
- So the pre-data expectation that Z1 might be FLAGGED or WORSE did not happen in this block.
- **Frames during Z1 strokes (dt > 50 ms per run):** C 2, 1, 3, 2; V 1, 16, 3, 2.
  - V2's 16 is the hot run: 42.6-43.3 °C after the unparked gap, and that run took ~2.5 min against ~1.1-1.7 for
    the others. The other three V runs sit inside C's range.
  - This is a G run, so the counts compare only on ms thresholds (F-071).
  - dt > 34 ms: C 15, 10, 13, 15; V 10, 22, 14, 13.

**Decision (registered rule):** overlap in every zone, so the card part passes. Next is the F stage through the
console (on mgmt-ops' word), then the independent review, then landing.
