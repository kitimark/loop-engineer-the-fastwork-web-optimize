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
| fixes/morph-scroll/sim7d-compare.mjs (C vs V start state and path, D1; the rule frozen by ops before s6/s7) | 777663766071 |
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

Known Simulator counts so far (counts are not changed by the rule; the predictions above stay as committed in 5d91a542):

| item | arm | session / record | counts |
|---|---|---|---|
| fo | C | s4 (`s4-2-R7C-g-flingout-v1.json`) | caught 3 of 3 (minP -0.13 / -0.39 / -0.12, rest -0.03), released 0, pulled back 0 |
| fo | V | s1 (`s1-1-R7E-g-flingout-v1.json`, old runner) | released 3 of 3, caught 0, pulled back 0; Fv -6.45 / -4.74 / -4.81, travel 560 |
| nl | C | s3 (`s3-2-R7C-g-nearline-v1.json`) | near-250 caught 3 of 3, near-280 caught 3 of 3, pulled back 0 |
| nl | V | s2 (`s2-1-R7E-g-nearline-v1.json`, old runner) | near-250: caught 3 of 3 (Fv -2.13 / -2.13 / -2.16, travel 250); near-280: caught 3 of 3 (Fv -2.35 / -2.42 / -2.39, travel 280); pulled back 0 |
| fs | C | s4 (`s4-1-R7C-g-fastshort-v1.json`) | misses 0, all 12 closes caught, pulled back 0 |
| fs | V | s3 (`s3-1-R7E-g-fastshort-v1.json`) | misses 0, all 12 closes caught (Fv -0.73 .. -2.92, travel 47-200), pulled back 0 |
| e4 | C, V | s5 | pending |

Planned sessions: s5 e4 C and V; s6 V fo and nl (served hashes; exact match, and V-V A/A against s1/s2); s7 C fs and fo
(C-C A/A against s4). fs on V and e4 on both arms then still lack an A/A pair: one more run each (s8) before the read.
Compare output for every item goes to ops for the final read.

D2, session s1's items 2 and 3 (nl on V, fo on R7D): they printed `RUN 2` / `RUN 3` and left no record. The cold boot
plus settle (~90 s) left too little hold time, so `sim.mjs gesture` refused before any touch (the budget message was cut
by the old runner's output filter), and the session still exited 0 because the old runner chained items with `;` and
its last pipeline was `head`. s2's second item (fs on V) was refused the same way, and printed it: "needs about 145 s,
... leaves 141 s". Neither counts: an item counts only when it left a record. The runner now prints `ITEM ... VOID`
for such items and exits non-zero.
