# Phone ticket: PR-018 rev 7d G count check (fix-hero-exit-threaded, 2026-10-05, before any phone data)

P-number: P-124 (assigned by the lead; ops registers it and does the pre-data read); lead signature: pending. No phone run before both.

**profile: xcode-serious.** Xcode-induced Serious, no heat pre-warm; `thermal-gate.mjs --accept-induced` at the start and
the end of each hold; 44 C / Critical ceiling. Not pooled with any other profile.

## The one question

Does rev 7d let a fast or long close fling leave the end screen in one fling on the phone (the v9 step 4 regression
from rev 7b/7c), while the user's kind of close (fast, short: <= 4.06 px/ms, 74-255 px) still commits to the closed
rest? Counts only (released / caught / pulled back to open / part-open; misses), no timing number.

## Arms (arm-neutral C/V, both on base v8 = msbase-3e3e94cb6e9f, CSS 659b02f7169d)

| arm | build | snapshot | JS sha256/12 | CSS sha256/12 |
|---|---|---|---|---|
| C (control) | rev 7c | out/snapshots/ms-428961bda278 | 428961bda278 | 659b02f7169d |
| V | rev 7d candidate: a close fling at lift-off is released when page Fv <= -5 px/ms or finger travel >= 300 px | out/snapshots/ms-29c0d537e0c9 | 29c0d537e0c9 | 659b02f7169d |

delta.diff (v8 -> V) c634e3fbd90b, patch.diff (baseline -> V) 38d1c30bcc18 (commit dfa06593). The hold script serves
each arm on its own plain-http port plus B (the plain baseline, the gate's timer page) and refuses a wrong served hash.

## Driver, items, probes

Driver G (WDA), `iphone.mjs wda check` first. Runner `fixes/morph-scroll/phone/g7d-hold.sh` (file sha256/12
5521f5004f67; its self-test `g7d-hold-selftest.mjs` 1edc28928ccc, 8 of 8 ok), one exclusive `--no-timing` chrome-measure
hold per H, iphone lease with `--block P-124`:
- start gate, one uncounted warm-up load per arm port (C, V), the items, park after every run, end gate.
- H1: `foC foV nlV nlC`; H2: `fsV fsC`; H3: `e4C e4V`. fo and nl: one run per arm, 3 (fo) / 6 (nl) counted closes each.
  **fs and e4 run once per arm** (one gesture run each, its strokes counted). fs's gesture budget is 229 s per run, so
  fs and e4 get a hold each (re-runs must fit).

Pins. Script pins are **program hashes** (`GESTURE_HASH` / the compiler's `program.hash`, 12 chars; ops recompiled them),
plus the file sha256/12 of each file:

| item | script | program hash | file sha256 | what |
|---|---|---|---|---|
| fo | g-flingout-v1.json | 35df651e2994 | 97eda447f36b | 3 x 560 px / 140 ms close fling from the open end (flick-middle's fling) |
| nl | g-nearline-v1.json | b53003eac220 | 83b2ed71b6b7 | 3 x 250 px + 3 x 280 px closes from open in 120 ms |
| fs | g-fastshort-v1.json | 8737f212c0ff | df597802d2f0 | short flicks at the end, 60-200 px in 50-90 ms |
| e4 | g-momentum-v1.json | 658e195e77fa | c6cee2ac416e | E1-E4 at the end; E4 = 200 px / 140 ms close flick |

| tool | file sha256/12 |
|---|---|
| fixes/morph-scroll/sim7d-analyze.mjs (counts) | 5e8c4f587342 |
| fixes/morph-scroll/msdbg-inject.mjs (probe) | 9d2d119f5cea |
| fixes/morph-scroll/sim7d-compare.mjs (C vs V start state and path, D1; the rule frozen by ops before s6/s7; 777663766071 plus a parser fix for e4's `$flicks` repeat count, rule unchanged, fo/fs output byte-identical; then the lead's AMEND-b lines beside the frozen verdict, which output minus `^AMEND-b` lines keeps byte-identical) | e2c2bfdad2ba |
| fixes/morph-scroll/sim7d.sh (Simulator dry runs, prints SERVED hashes, D3) | fb357826def1 |

Probe: `--inject fixes/morph-scroll/msdbg-inject.mjs` (V's debug-only touchend log: page Fv, finger travel; a passive
scroll-event log of scrollY). Counts: `node fixes/morph-scroll/sim7d-analyze.mjs out/morph-scroll/g7d`.
Expected minutes: H1 ~5, H2 ~6, H3 ~4; ~15 in all.

## Validity (ops D4, D5; the lead's exit-code rule)

- An item whose gesture exits non-zero or leaves no record is **VOID** (`ITEM <item> VOID ...`). An earlier record of
  the same name is moved aside before each item, so a stale file is never scored.
- Each void item gets **one re-run at the hold end** (same arm, `<H>-<item>-rerun.json`). Void again: the item is
  **INSUFFICIENT**, the hold prints `HOLD <H> VOID counted item(s) failed` (exit 6) and never VALID.
- A failed start gate, wrong served hash, WDA not ready, or failed end gate voids the hold (exit 5 / 4 / 4 / 3).
- A refused gesture (I-112 budget) counts as exit non-zero.

## Predictions (before data) and decisions

One prediction per line, each with its probability (fix-hero-exit-threaded's, before any phone data).

| # | item | prediction | P | if it holds | if not |
|---|---|---|---|---|---|
| 1 | fo | C (control) caught 3 of 3 | 0.85 | fo is scorable | **fo is unscorable** (the control did not reproduce rev 7c's catch): no pass for V on fo, report with positions |
| 2 | fo | V released >= 2 of 3 (scored only if line 1 holds) | 0.80 | step 4 (the user's blind swipe pair) | V caught: read page Fv/travel per fling; WDA travel short of 300 on the phone -> report, no threshold change without the lead |
| 3 | nl | V caught 6 of 6 | 0.85 | as line 2 | a near-line close released on V: the travel line is too close to the user's closes; propose 350 px to the lead before step 4 (the lead decides) |
| 4 | nl | C caught 6 of 6 | 0.90 | control as expected | report; nl then scores V against C's count |
| 5 | fs | V misses <= C misses (one run per arm) | 0.80 | as line 2 | a new miss on V: compare its Fv/travel with the rule; fix before step 4 |
| 6 | e4 | E4 closes on C (one run) | 0.90 | control as expected | report; e4 then scores V against C |
| 7 | e4 | E4 closes on V (one run) | 0.85 | as line 2 | V's E4 not closed: same as line 3 |
| 8 | all | pulled back to open on V <= C (return-to-open UNRESOLVED in every build) | 0.80 | as line 2 | more returns on V: report with positions; Risk 1 of the D card |

## Simulator dry run (F-256, ops D1-D3; count-only, I-184, same scripts and probe)

Sessions run `fixes/morph-scroll/sim7d.sh` (served hashes printed and checked per arm; items VOID on a non-zero exit or
no record). C vs V: `node fixes/morph-scroll/sim7d-compare.mjs <C> <V> --aa-c <C2> --aa-v <V2>`.

**Disclosure: the path rule changed twice after data was seen.** (1) The first rule was strict per counted stroke:
touchmove count within 2 and index-aligned clientY path within 6 px. On fo it gave a DIFF from one dropped move (V's first
fling: 8 moves against 12), so (2) the path was aligned in order (a dropped move skipped, DP) instead; that still failed
where both lists had points the other lacked (fs). (3) The rule then became a shared-points fraction per group of
identical strokes, with a bar taken from within-record same-arm pairs. All three were seen on s1-s4 data. mgmt-ops-10
then froze the A/A form below on 2026-10-05, **before** the s6/s7 data; `sim7d-compare.mjs` 777663766071 implements it
and was committed before s6 ran.

**The frozen rule (ops):**
1. Exact match per counted stroke, C vs V: start y and p, touchstart clientY, lift clientY; program id, toolbar level,
   endH, maxY, first touch; prevented touchmoves = 0 on both arms.
2. Touchmove stream, per group of identical strokes: the C-V shared-points fraction (in order, +-2 px) is at least the
   lowest same-arm fraction from the A/A pairs of that group (C-C: s7 against s3/s4; V-V: s6 against s1/s2); every
   stroke monotone; move counts reported, not judged.
3. Coverage: every item on both arms, e4 included (s5). A group with no A/A pair (C-C or V-V) fails until it has one.
4. D3: the V fo and nl records from s6 (which print served hashes) replace s1/s2 in the exact-match check; s1/s2 stay
   only as A/A partners.

Simulator counts, final (counts are not changed by the rule; the predictions above stay as committed in 5d91a542).
Exact-match records first, A/A partners after the slash; every record of an item gave the same counts:

| item | arm | exact / A/A records | counts |
|---|---|---|---|
| fo | C | s4-2 / s7-2 | caught 3 of 3 (s4: minP -0.13 / -0.39 / -0.12, rest -0.03), released 0, pulled back 0 |
| fo | V | s6-1 / s1-1 | released 3 of 3, caught 0, pulled back 0; s6 Fv -2.9 / -4.63 / -4.68 (released by travel 560 >= 300; s1 Fv -6.45 / -4.74 / -4.81) |
| nl | C | s3-2 / s12-1 | near-250 caught 3 of 3, near-280 caught 3 of 3, pulled back 0 |
| nl | V | s6-2 / s2-1 | near-250 caught 3 of 3 (s6 Fv -2.13 / -1.8 / -2.16, travel 250); near-280 caught 3 of 3 (Fv -2.42 / -2.37 / -2.53, travel 280); pulled back 0 |
| fs | C | s4-1 / s7-1 | misses 0, all 12 closes caught, pulled back 0 |
| fs | V | s3-1 / s10-1 | misses 0, all 12 closes caught (Fv -0.73 .. -2.95, travel 47-200), pulled back 0 |
| e4 | C | s9-1 / s13-1 | E1 caught, E3 pulled back to open (the E3 miss, both arms), E4 caught; released 0 |
| e4 | V | s8-1 / s11-1 | E1 caught, E3 pulled back to open, E4 caught (Fv -1.93 / -1.67, travel 200: under both lines, as predicted); released 0 |

Released / caught / pulled back to open, V against C: fo 3/0/0 against 0/3/0 (the intended change); nl, fs, e4
identical. The ticket's "all: pulled back V <= C" line is judged on the phone, not here.

Sessions run: s5 e4 C (VOID by ruling A; its V item VOID, budget after a cold boot); s6 V fo and nl; s7 C fs and fo;
s8 V e4 (C e4 VOID, budget); s9 C e4 (C nl VOID, budget); s10 V fs; s11 V e4; s12 C nl; s13 C e4 (start state endH 815,
maxY 6075, first touch 0 / -6.45 / 681, as every other record). Records are in the gitignored `out/morph-scroll/sim7d/`.

**Final compares** (`sim7d-compare.mjs` e2c2bfdad2ba, every item with a C-C and a V-V A/A pair):

| item | C | V | --aa-c | --aa-v | frozen RESULT (exit) | AMEND-b RESULT |
|---|---|---|---|---|---|---|
| fo | s4-2 | s6-1 | s7-2 | s1-1 | SAME (0) | SAME |
| nl | s3-2 | s6-2 | s12-1 | s2-1 | SAME (0) | SAME |
| fs | s4-1 | s3-1 | s7-1 | s10-1 | SAME (0) | SAME |
| e4 | s9-1 | s8-1 | s13-1 | s11-1 | **DIFF 4 (2)**: start y on counted strokes 3-6 | SAME: 4 start-y DIFFs exempted |

- e4 under the frozen rule FAILS, as it stands: counted strokes 3-6 (the mid-page flicks) start 20, 43, 42 and 727 px
  apart C vs V. Page state, program, E1-E4, every lift, prevented = 0 and all five path groups are SAME (C-V shared
  0.67 / 0.82 / 0.97 / 0.99 / 0.88 against need 0.67 / 0.8 / 0.85 / 0.79 / 0.88; monotone yes).
- AMEND-b (ruling B): counted stroke 2 already ended 20 px apart (C 2034, V 2014), so strokes 3-6 are past the chain
  break, and the clean C-C pair s9 vs s13 starts them 118, 181, 182 and 873 px apart (all > 8 px). All four are exempt;
  nothing else differs.
- Output version check (command lines and hashes sent to ops): on fo, nl and fs the 777663766071 and 9cb401ffd83d
  outputs are byte-identical; on all four items the e2c2bfdad2ba output minus `^AMEND-b` lines is byte-identical to
  9cb401ffd83d's. 777663766071 cannot read e4 (exit 1: the unresolved `$flicks` repeat count the parser fix covers).

**Ops final read (D1), PASS with notes N1-N4 (mgmt-ops-10, 16990e85; finalver.sh reproduced, every exit code, output
hash and record hash matched).** The phone write-up carries them:
- N1: e4's frozen DIFF 4 is reported beside the AMEND-b SAME, never instead of it.
- N2: two e4 path groups pass exactly at their bar: the up 200 px fling (C-V 0.67 = need 0.67) and the down 150 px
  drag (0.88 = 0.88).
- N3: the Simulator counts show the mechanism only; prediction 8 (pulled back to open V <= C) is judged on the phone.
- N4: the late-flick start drift is within-build (s9 against s13, both C, 118-873 px apart), not an arm effect.

**Rulings after e4 data (2026-10-05).**
- **A (ops, within the frozen rule):** s5 is VOID, both as the exact-match C record and as an A/A partner. Its page
  started in another state after a cold boot (endH 932, maxY 6426, docH 7201; every other record has 815 / 6075 / 6850),
  and a partner that starts from another state lowers the C-C bar V must clear. s9 is the exact-match C e4 record; s13
  (one more C e4 run, same start-state check) is the C-C partner. s5 is a disclosed void, like the budget voids.
- **B (the lead, disclosed amendment, made after the s5/s8/s9 e4 data was seen and before the s13 data):** under the
  frozen rule e4 FAILS start y on counted strokes 3-6 (mid-page flicks, whose start depends on how far the previous fling
  coasted); that frozen verdict is reported as it stands in every write-up. The amendment, option (b): a counted
  stroke's start y / p is judged only while every earlier counted stroke ended within +-8 px C vs V. It applies only
  where the clean C-C pair (s9 vs s13) also starts that stroke more than 8 px apart; where s9 and s13 stay within 8 px
  and V differs, the frozen FAIL stands. Path, lift, prevented = 0 and monotone stay checked on every stroke, and E1-E4
  must match exactly. Option (a), dropping the start check on counted strokes, was rejected.
- `sim7d-compare.mjs` e2c2bfdad2ba prints the amendment as `AMEND-b` lines and an `AMEND-b RESULT` line beside the frozen
  `RESULT` (exit code = the frozen verdict); its output minus the `AMEND-b` lines is byte-identical to 9cb401ffd83d's
  (checked on fo and fs), and 9cb401ffd83d's is byte-identical to 777663766071's on fo and fs.

D2, session s1's items 2 and 3 (nl on V, fo on R7D): they printed `RUN 2` / `RUN 3` and left no record. The cold boot
plus settle (~90 s) left too little hold time, so `sim.mjs gesture` refused before any touch (the budget message was cut
by the old runner's output filter), and the session still exited 0 because the old runner chained items with `;` and
its last pipeline was `head`. s2's second item (fs on V) was refused the same way, and printed it: "needs about 145 s,
... leaves 141 s". Neither counts: an item counts only when it left a record. The runner now prints `ITEM ... VOID`
for such items and exits non-zero.
