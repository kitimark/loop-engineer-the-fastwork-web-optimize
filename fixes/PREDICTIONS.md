# Predictions ledger (protocol v2 §4)

One row per prediction made before a timed run. Rules: `research/architecture/measurement-protocol-v2.md` §4
(prediction card: build + base + hashes, driver, metric, baseline, closure check, term breakdown, predicted delta with
interval, falsification reading, decision). A model with **two misses** (outside its interval) is reviewed by its
author's team before it drives another build. Kept by mgmt-ops; owners send their prediction card before the run and
the measured result after it.

Columns: **id** · author · date (UTC) · build vs base · driver (S scroll / W window / M morph driver / G gesture /
F finger, §5.4) · metric · predicted [interval] · measured median [range or IQR] · in interval? · error ratio
(measured / predicted delta) · lesson.

Rows before 2026-10-01 ~10:45Z were made before protocol v2: their predictions were stated in messages or notes, not
on a prediction card, and the runs were n=3 (not 4v4). They are recorded so the two-miss rule counts them.

| id | author | date | build vs base | driver | metric | predicted [interval] | measured | in? | ratio | lesson |
|---|---|---|---|---|---|---|---|---|---|---|
| P-001 | de-morph | 10-01 09:12 | mw10e-gh vs mw10e-g (aw1-10e) | M | morph moving-frame p50 delta | drop >= 25 ms (model: 30-45 ms) | gh 26 vs g 35 ms (−9; second round gh 24 vs g 33, −9) | **miss** | ~0.3 | size-stable panel (R1) is one term, not the dominant one; model recalibrated (1043651) |
| P-002 | de-morph | 10-01 09:12 | mw10e-gb vs mw10e-g | M | moving p50 delta | <= 10 ms | gb 29 vs g 35 (−6) | hit | – | the "b" builds removed panel + platform filters only, not the nav backdrop (mislabel found later) |
| P-003 | fix-nav-morph | 10-01 09:31 | mw10e-ghb vs mw10e-gh | M | moving p50 | 17-20 ms if gh and b savings add | ghb 21 vs gh 24 (round 2); ghb 26 vs gh 27 (round 3) | **miss** | – | savings don't add; a third term dominates the tail |
| P-004 | de-middle | 10-01 09:20 | mw10e-e2 (IO margin 150 %) vs aw1-10e | S | y of the long frame | moves to y≈2218 | y≈2240, same ~96 ms | hit | – | proves where the trigger is (position-moving ablation), not what costs (v2 L3) |
| P-005 | de-middle | 10-01 09:20 | mw10e-e1 (passive listeners) vs aw1-10e | S | y≈1960 long frame | H1a: frame shrinks if listener arming costs | 94 vs 94 ms | (H1a rejected) | – | negative ablation, useful |
| P-006 | fix-nav-morph | 10-01 09:52 | mw10e-src vs aw1-10e | S | y≈1960 long frame | frame removed (img src burst = cause, F-043) | control 86/92/88 vs src 97/84/91 | **miss** | ~0 | the R3 logger capped at 12 events/frame and hid `inert` (F-044); uncapped per-type counts now |
| P-007 | fix-nav-morph | 10-01 10:2x | mw10e-noinert vs aw1-10e | S | y≈1960 long frame | < 50 ms (inert flip = cause, F-044) | control 102 vs noinert 98 [95-99] | **miss** | ~0.1 | the frame's cost is not an attribute write; needs Timeline attribution (P2b) before another build |
| P-008 | de-hero / fix-hero-exit | 10-01 09:35 | hero h1 vs P2; h1v2 vs P | W (0-1500) | flip frame pair y≈680-750, worst per run | <= 34 ms | h1 45 [41-52] vs P2 56; h1v2 52 [35-77] vs P 65 | **miss** (1/6 runs <= 34) | ~0.5 | real ~11-13 ms gain, but v2's own extra cost at the flip remains |
| P-009 | de-morph | 10-01 ~10:30 | mw10e-ghbn vs mw10e-ghb | M | moving p50, hump | <= 20 ms and the hump flattens (backdrop on the rAF path) | ghbn 25 vs ghb 26 vs gh 27 (n=3, pre-v2) | **miss** on rAF | – | lead 10:5xZ: the expected reading under L13 (backdrop GPU time is invisible to rAF). ghbn = **render-bound, LOCATED**, not "no effect"; no more rAF blocks; 1-min computed-style mechanism check owed; real verdict from T10 / Instruments hitches |
| P-010 | de-safari | 10-01 ~10:30 | mw10e-ghbn vs mw10e-ghb | M | moving p50, hump | within ±2 ms of ghb, hump stays (render-server term) | as P-009 | **hit** on rAF (mechanism check owed) | – | rAF-neutral confirmed; whether the backdrop costs render-server time waits for Instruments hitches (T10) |
| P-011 | fix-nav-morph | 10-01 10:3x | mw10e-na (listeners armed at setup) vs aw1-10e | S (C A B B A C) | y≈1960 edge frame | removed if the listener add at the IO edge costs | C 104/107 vs na 34/35 ms; neighbours ±2 frames 4-33 ms; scroll fps 57.0/57.6 vs 55.4/56.3; whole-scroll > 50 ms 0/0 vs 3/1 | **hit** | – | positive arm of the first NAMED card (v2 §2.3); P2b Timeline: RecalculateStyles 34-42 ms (incl. Layout 19-24) + Composite 58-72 ms, JS ~1 ms |
| P-012 | fix-nav-morph | 10-01 10:3x | mw10e-nb (no `b` at the edge) vs aw1-10e | S | y≈1960 edge frame | stays if `b` is not the cost | nb 84/101 vs C 104/107 | **hit** | – | negative arm: the `b` effect flush is not the cost |

Open (prediction cards owed before the run): the na-based landable fix (idle-armed listeners + touchmove gate), fixed-size morph diagnostic, ghr85a (R5a), hero-B
v6/v7 (de-hero: y≈700 back to ~52 ms), R2 bg-layers, r3a/r3b, /10d phone check, N12.

Two-miss watch: **de-morph** (P-001, P-009 on rAF; P-009 is read under L13, so it counts only if Instruments also shows no change) → its model is reviewed before it drives another build
(1043651 already recalibrated after P-001); **fix-nav-morph** (P-003, P-006, P-007) → its y≈1960 hypotheses go
through the D-stage attribution card (P2b Timeline pass) before the next build.
