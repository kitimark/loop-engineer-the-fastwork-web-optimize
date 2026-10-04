# Fix: scroll-cb-phone

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch-on-best.diff` and `patch.diff` contain excerpts of Fastwork's code: keep them on local branches,
> never push.

**Status:** draft (ticket written, no data yet)
**Stage:** I (implemented on the best build); the counts ticket below is for ops to read before any data
**Device class / gate:** less-work fix (memory `less-work-landing-rule`): Chrome + Simulator work counts, then one short
phone no-worse check (own ticket and P-id, after the counts pass)
**Driver(s) behind the claims:** Chrome scripted scroll (counts only), Simulator scripted scroll (counts only)
**Prediction:** `fixes/PREDICTIONS.md` P-103 (the D card below)
**Source:** frame audit §5 item 2 (`research/design-engineering/frame-audit.md`, user T-100)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, inside the four side-job components: a new helper
`scbGate` (pretty JS ~3182, before `AE`), commission `AE` (~3255-3400), profile `uM` (~11011-11311), future `mM`
(~11539-11741), platform `GM` (~12678-12830). No engine change (`dE`/`rE`/`iE`/`aE`/`uE` untouched), no nav change,
no CSS change.

## Why it lags (R)

- During a scroll, the engine (`dE` → `rE` → `iE`) calls four side jobs every frame while their section is near the
  viewport: commission `o` → rAF `a`, future `u` → rAF `l`, platform `r` → rAF `n`, profile `m` → rAF `f`.
- The frame audit counted about 146 job entries per second during the scroll, in the baseline and the best build alike
  (§2.2: `a` 45, `l` 36, `f` 34, `n` 31 per second), each reading 1-3 rects.
- On phones, CSS switches the visible effect of commission, future and platform off (the same media queries the JS
  checks). The best build skips their style writes there, but not their scheduling or their rect reads. What still
  reaches the frame on a phone is a handful of class flips at fixed lines:
  - commission: `entering` on the card, `shrinking` on the section;
  - future: `is-visible` (hero track line), `is-future-shrinking`, and `.pain is-pain-dark` (max-width 860);
  - platform: `is-platform-shrinking`.
- The profile job's phone path `d()` is idempotent: after its first run it writes the same values every frame.

## What changed (I)

`patch-on-best.diff` (against the best build `65052c4a3902` / `e0f92804c521`; `build.mjs` applies it). The jobs stay
registered with `dE` (pitfall P12: never unregister); only their trampolines are gated.

- **`scbGate(rows, onChange)`**: for every element whose edge drives a class flip, two half-space
  IntersectionObservers on the viewport, one per side of a band around the flip line(s):
  - a top-edge row uses `rootMargin: 100000% 100000% (x-100)% 100000%`, so the root is (-inf, x] and
    `isIntersecting` ⇔ top ≤ x;
  - a bottom-edge row uses `-x% 100000% 100000% 100000%`, so the root is [x, +inf) and `isIntersecting` ⇔ bottom ≥ x;
  - `near()` is true while any edge is inside its band, or while any state is still unknown.
  - Percent margins on top/bottom resolve against the root's height in both engines (CONFIRMED: Chromium
    `intersection_geometry.cc` `ResolveMargin`, 18ea505de18d; WebKit `IntersectionObserver.cpp` 351-360, f61e4bfbb6a7;
    the spec text says width, so the engines, not the spec, are what this relies on).
- **Bands** (viewport fractions, each widened by M = 0.15):
  - commission: card top 0.06-0.995 (the `f` transition and `entering` at 0.0744 / 0.995), section bottom 0.35-0.85
    (`shrinking` at 0.83);
  - future: hero-track top at −0.72·max(1, H−ih)/ih (`is-visible`), card bottom 0.35-0.85 (`is-future-shrinking` at
    0.83), header top at 0 (`is-pain-dark`);
  - platform: card bottom at 0.83 (`is-platform-shrinking`).
- **Scheduling, per job** (commission shown; future and platform the same):
  - the engine's callback `o` sets `poke` and schedules the job only if the effect is on (`!scbOff`), the state is
    `dirty`, or the gate says `near`;
  - an IO change while `poke` is set schedules the job (the same frame the baseline job would run); without `poke` it
    marks `dirty`;
  - deactivation (`onActiveChange(false)`) runs the job once if `poke` is set, then clears `poke`;
  - resize and media-query changes mark `dirty` and start or stop the gate;
  - the job clears `poke` and `dirty`.
  - On desktop widths where the effect is on, `scbOff` is false and the job runs exactly as before.
- **Profile `uM`**: after the phone path `d()` has run once, `m` schedules nothing until the media query, reduced motion
  or the active profession changes (`scbProfIdle`).
- **Timing of the flips.** Baseline: a scroll in frame N runs `o` in N and the job in N+1. V: a crossing is seen either
  by `near` (IO state from N−1, wider band than any one-frame move here) or by an IO change with a fresh `poke`, so the
  job runs in N+1 as well. Activation after a jump: J+2 in both. Extra job runs in V happen only in frames where the
  baseline also ran the job, so they write the same values.
- **Known residual** (documented, not expected in a scroll): a stale `poke` plus a sudden non-scroll layout shift that
  moves a line across a band can flip a class one frame after the shift instead of at the next scroll. The eased values
  (n, r, o) that are used only after a phone → desktop switch can differ after such a shift until the next scroll frame.

## Boundaries agreed with fix-nav-morph (2026-10-04)

- **Mine:** commission `a`/`o`, future `l`/`u`, platform `n`/`r`, profile `f`/`m`, and their `dE` call sites.
- **Theirs:** `dN`, `_` / `F` / `ee`, the nav's `dE(L)`.
- **Shared, ask first:** the engine (`dE`, `rE`, `iE`, `aE`, `uE`). This fix does not touch it.
- They read the classes I flip (`shrinking`/`entering`, `is-pain-dark`, `is-platform-shrinking`, `is-visible`) as
  triggers; I keep those flips in the same frame and order (checked below).

## D card P-103 (pre-registered; committed before its data)

**Question.** During a scripted scroll over the full page, do the four side jobs schedule and read less per scroll frame
in V than in C at phone widths, with no more lifecycle work, and with every class and style write of the side jobs and
the nav identical frame by frame, at phone and desktop widths and across a breakpoint resize?

**Gate.** The less-work landing rule: judged counts per event; the event is one scroll frame (one driver step). No
smoothness or timing claim.

**1. Arms** (sha256/12 of the JS node / CSS as served; a load that serves other hashes is VOID).

| arm | what | `2.DyWL8TcE.js` | `2.gBuqKVzi.css` |
|---|---|---|---|
| C | the best build, snapshot copy `out/snapshots/best-65052c4a3902` | 65052c4a3902 | e0f92804c521 |
| V | C + `patch-on-best.diff` (the landing build, no debug code), snapshot copy `out/snapshots/scb-27f23f6a3878` | 27f23f6a3878 | e0f92804c521 |

Both on the baseline snapshot pinned by this branch's `baseline.json`. `node fixes/scroll-cb-phone/build.mjs` rebuilds V
from the committed diff, refuses other hashes, and prints this table.

**2. Harnesses** (committed with this card; sha256/12). Any later change is listed here with its new hash and what it
changes, before its data.

| file | sha256/12 | role |
|---|---|---|
| `build.mjs` | 0b028c5ef8a5 | arms (C check, V build, snapshot copies) |
| `patch-on-best.diff` | c2dc144b7bd2 | V's change |
| `probe/scb-probe.mjs` | 109c8d62810b at the card; d2f4a6b2a60d after harness change 1 | Chrome: rAF-request / rect / scrollY counter, trace counter (forced layout, lifecycle), per-frame state logger |
| `simcount.mjs` | 6af68099ea53 | Simulator (WebKit): the same counters and state logger, Timeline counts |
| `pixcheck.mjs` | f1be95111e25 | pixel diff: `tools/check.mjs` (5fc6b9180ae6 on main at this card) on C1, V, C2 |

- *Harness change 1 (after the ops read PASS of ce4ef96b, before any C/V data):* the C-only smoke was VOID with
  "trace marks missing": `performance.mark` lives in the `blink.user_timing` trace category, which the trace config
  lacked. `scb-probe.mjs` adds that category and, for ops note N2, counts trace events whose name contains
  "Intersection" (`computeIntersections` per step, with the names seen; reported, not judged). Nothing else it counts
  changed. New `scb-probe.mjs` hash: d2f4a6b2a60d.
- *Ops notes on the read (mgmt-ops-10):*
  - N1: the C-only smoke must show non-zero side rAF and rect counts on C in the Simulator (proof that the late wrap
    catches jobs registered before settle), and the same is logged for Chrome's document-start wrappers. If the
    Simulator reads 0 on C, `simcount.mjs` gets a new revision and hash before any data, and ops is told first.
  - N2: if the Chrome trace has an intersection-observation event, its count per step is reported for C and V, not
    judged; if it has none, the result says so. The phone no-worse check stays where the IO cost is judged.
- `scb-probe.mjs` (Chrome, headless, no CPU throttle; `serve.mjs --https --vendors=local --no-cache --port auto`,
  `--root` the pinned baseline + `--overlay` the arm's snapshot copy; a fresh Chrome per load; UA and virtual screen as
  `tools/check.mjs`):
  - driver: one `scrollTo` per frame, 10 px steps, top → bottom → top, then 21 instant jumps held 3 frames each;
  - counters (document-start wrappers): `requestAnimationFrame`, `getBoundingClientRect`, `scrollY`/`pageYOffset`
    reads, `getComputedStyle`, `querySelector`, `elementsFromPoint`, keyed by the JS line on the caller's stack and
    attributed to the enclosing top-level function (side = `AE`, `uM`, `mM`, `GM`, `scbGate`);
  - trace (`devtools.timeline` + stack) between two marks: FireAnimationFrame, PrePaint, UpdateLayoutTree, Layout,
    Paint; UpdateLayoutTree / Layout inside a FireAnimationFrame = forced, attributed by stack; FunctionCalls into the
    node JS by function (= job runs);
  - state logger: before every frame's work, class + style attribute of the nav, commission section/card/runway,
    `.pain`, future section/card, platform section/card, profile, profile sticky and the active shell; changes stored
    as (frame, step, element, value).
- `simcount.mjs` (Simulator, functional session, plain http, a new port per load): same driver without the jumps
  (top → bottom → top, 10 px per rAF), counters installed after settle (late wrap: the page looks the APIs up at call
  time), Timeline window: RenderingFrame, RecalculateStyles, Layout, Paint, FireAnimationFrame, and RecalculateStyles /
  Layout nested in a script record (forced). Same state logger (keyed by step).
- `pixcheck.mjs`: serves C and V, runs `tools/check.mjs C1=<C> V=<V> C2=<C> --viewport both` (mobile 430×932 DPR 3
  touch, desktop), screenshots top / middle (45 %) / bottom, pixel diff vs C1 (% of pixels whose RGB sum differs by
  more than 48).

**3. Loads and order.**
- Chrome viewports: `phone` 430×932 DPR 3 touch, `phone775` 430×775 DPR 3 touch (the iPhone's scripted geometry),
  `desk` 1280×900 DPR 1, `desk900` 900×900 DPR 1 (commission compact, future/platform/profile not), `resize` (the
  phone run, then mid-page: 1280×900, 40 steps down, back to 430×932, 81 steps up).
- Per viewport 4 loads in the order C1 V1 V2 C2, in 2 shared-lane holds of 2 loads (`C:1 V:1`, then `V:2 C:2`), weight
  `probe`, `--max-seconds 300`, appended to one `out/scroll-cb-phone/counts-<vp>.json`. No CPU throttle (counts only).
- Simulator: 1 hold, `--weight simulator --max-seconds 300`, `C:1 V:1 V:2 C:2` (split in 2 holds of 2 loads in the
  same order if one does not fit); the booted device and its viewport are recorded per load.
- Pixels: 1 shared-lane hold, weight `check`, `pixcheck.mjs` (C1 V C2, both viewports).
- Output in `out/scroll-cb-phone/` (gitignored); the scored summary goes into this README after scoring.

**4. VOID** (per load):
- the load errored, or the served hashes differ from the table;
- the node JS did not load or the document is shorter than 3 viewports;
- Chrome: the trace marks are missing, the driver queue did not finish in 150 s, or the driver marks are not all seen
  (2, or 4 in `resize`); Sim: the scroll did not finish in 200 s;
- a page error in V that C does not have.
An arm with fewer than 2 valid loads in a viewport is re-run with new loads in the same order, and the re-run is
reported. A VOID load is reported, never scored.

**5. Judged and guard counts** (per step; "mean" = mean of the valid loads of an arm in that viewport).
- *Judged, Chrome `phone` and `phone775`:* side rAF requests per step and side `getBoundingClientRect` per step. Rule:
  every V load below every C load, in both viewports.
- *Judged, Chrome `desk900`:* commission (`AE`) rAF requests and rects per step, every V below every C (only
  commission is off there).
- *Equality, Chrome `desk`:* side rAF and rects per step, |V mean − C mean| ≤ 0.05 (the effects are on; V must run the
  jobs exactly as C).
- *Guards, Chrome, every viewport:* forced Layout, forced UpdateLayoutTree, Layout, UpdateLayoutTree, PrePaint, Paint,
  FireAnimationFrame per step: V mean ≤ C mean + 0.05.
- *Judged, Simulator:* side rAF requests and side rects per step, every V below every C.
- *Guards, Simulator:* RecalculateStyles, Layout, forced Layout, Paint, RenderingFrame per step: V mean ≤ C mean + 0.05.
- *Size predictions are calibration, not gates:* "≥ 60 % fewer side rAF requests" and "≥ 50 % fewer side rects" at
  phone widths are scored and reported against the intervals below; missing them does not fail the card if the judged
  rule holds.
- Reported, not judged: side job runs (FunctionCalls into `a`/`l`/`n`/`f`), side `scrollY` reads, the `resize` counts.
- Not counted by these harnesses: the gate's own IntersectionObserver work (no trace event is counted for it). The
  phone no-worse check covers it.

**6. Predictions** (intervals, per step).

| count | C | V |
|---|---|---|
| Chrome side rAF requests, `phone` / `phone775` | 1.2 to 3.5 | 0.05 to 0.8 (≥ 60 % below C) |
| Chrome side rects, `phone` / `phone775` | 2 to 8 | 0.1 to 2.5 (≥ 50 % below C) |
| Chrome `AE` rAF requests, `desk900` | 0.3 to 1.2 | 0.02 to 0.4 |
| Chrome side rAF / rects, `desk` | as measured | C ± 0.05 |
| Chrome forced Layout, phone widths | 0.2 to 1.5 | C minus 0 to 0.8 |
| Chrome Layout / UpdateLayoutTree / PrePaint / Paint, FireAnimationFrame | as measured | ≤ C + 0.05 |
| Sim side rAF requests | 1.2 to 3.5 | 0.05 to 0.8 |
| Sim side rects | 2 to 8 | 0.1 to 2.5 |
| Sim RecalculateStyles / Layout / Paint / RenderingFrame | as measured | ≤ C + 0.05 |

**7. Parity** (must hold).
- *State log, Chrome, every viewport including `resize`:* each load's changes compared with C1's, keyed by (driver
  step, element, value). Differences of V beyond A/A = 0.
- *State log, Simulator:* the same rule.
- *Pre-existing A/A flake* (defined now): a (step, element, value) entry that differs between C2 and C1 in the same
  viewport and engine. A V difference identical to such an entry is not counted; every other V difference counts. If
  C2 vs C1 has more than 10 differences in a viewport, that viewport's parity is VOID (the logger is not stable enough
  to judge) and is re-run once.
- *Pixels:* `pixcheck.mjs`, per viewport and shot: V-vs-C1 ≤ C2-vs-C1 + 0.1 percentage points. (That is T0/T1 of
  memory `illusion-must-be-pixel-identical`: the design writes the same classes in the same frames; a static shot can
  only confirm the at-rest state, the state log is the frame-by-frame check.) Beyond it: the same shots are re-taken
  once; a difference that stays is a parity failure.
- No new page errors in V.

**8. What happens next, whatever the result.**
- *Pass* (judged lower, equality and guards hold, parity holds): ask mgmt-ops-10 for the phone no-worse ticket (own
  P-id, scripted S, 1 warm-up + C V V C, the lead's slot and order). Then `node tools/fix.mjs diff scroll-cb-phone` for
  `patch.diff` and a land request.
- *Parity fails:* not landable. The log names the step and the element; find the crossing the gate missed, fix it,
  re-ticket (new card revision with new V hash), re-run every part.
- *Counts not lower:* reported as the measured outcome; find which row keeps `near()` true (an exploratory run, not
  scored), re-ticket. No retuning on this card's data.
- *A guard is worse (V mean > C mean + 0.05), or `desk` equality fails:* not landable as a less-work fix. Reported as
  measured; find what moved in an exploratory run; re-ticket.

**9. Coupling with P-101 (nav-hit-cache).**
- nav-hit-cache uses class changes on `shrinking` / `entering` / `is-pain-dark` / `is-platform-shrinking` /
  `is-visible` as triggers for its real hit test. P-103's state parity checks that V flips them in the same driver step
  as C, so its triggers see the same frames.
- Before both land: the combined build (C + `nav-hit-cache/patch-on-best.diff` + this `patch-on-best.diff`; the two
  touch disjoint functions) gets (a) P-101's in-frame audit (VA hook on the combined build, all P-101 cases), run by
  fix-nav-morph, mismatches = 0, and (b) this card's state parity in `phone` and `resize` (combined vs C, beyond A/A =
  0), run by me. Whichever lands second rebases and re-runs both on the landed base.

## Smoke (not scored)

C only, one load per engine, to check the harness before C/V data (as P-101 did). Not part of P-103's loads.

- *Chrome, phone, `scb-probe.mjs` 109c8d62810b, 10-04 10:53Z, shared probe slot:* VOID "trace marks missing"
  (→ harness change 1). The parts before the trace worked:
  - served 65052c4a3902 / e0f92804c521; doc 6277 px; 1093 steps, 1195 frames; no page errors; 70 state changes logged;
  - N1, Chrome document-start wrappers on C: non-zero. Side per step: rAF 2.48, rects 3.87, querySelector 1.79.
    By job: `AE` rAF 0.76 / rects 1.52; `uM` rAF 0.58 / qs 0.58; `mM` rAF 0.61 / rects 1.82 / qs 1.21; `GM` rAF 0.54 /
    rects 0.54. Whole page per step: rAF 4.35, rects 6.44, getComputedStyle 1.02, elementsFromPoint 1.02.
  - The side rAF rate (2.48 per frame) matches the frame audit's ~146 entries/s at 60 fps.
- *Re-run with d2f4a6b2a60d (Chrome) and the Simulator C smoke (N1):* queued at 10:54Z, withdrawn for the lead's
  usage pause before it started; run after the pause (12:29Z Chrome, 12:34Z Simulator), both before any counted load.
  - Chrome, phone: valid. 1093 steps, no page errors. Side per step: rAF 2.48, rects 3.87 (as in the first try).
    Trace per step: FireAnimationFrame 6.50, PrePaint 2.41, UpdateLayoutTree 1.43 (forced 0.88), Layout 0.48 (forced
    0.26), Paint 5.68. Forced style/layout by function (whole run): `fD` 362/86, `AE` 297/179, `mM` 236/6, `dN` 43/13,
    `GM` 22/2.
  - N2: the trace has `IntersectionObserverController::computeIntersections`, 2.19 per step on C (2393 events). It is
    reported for C and V, not judged.
  - Simulator (fw-sim 15 Pro Max, 430×775 DPR 3, doc 6035): valid. 1052 steps. N1: the late wrap catches the jobs on C:
    side rAF 2.27, rects 3.53 per step (`AE` 0.67/1.34, `uM` 0.53/0, `mM` 0.56/1.68, `GM` 0.51/0.51). Timeline per
    step: RenderingFrame 0.95, RecalculateStyles 1.51 (forced 1.11), Layout 3.68 (forced 2.49), Paint 5.53.
  - Hold sizes seen: Chrome 57 s per load, Simulator 70 s per load (whole session), so the card's 2 loads per hold fit.

## P-103 result (scored per the card, 2026-10-04 12:40-13:30Z)

**Outcome: not landable as a less-work fix on this card.** The judged counts pass everywhere: V does about 75 % fewer
side rAF requests and 60 % fewer side rects at phone widths, in Chrome and in the Simulator. Three of the card's
own rules fail:
- the Paint guard, in Chrome `phone` and `resize` and in the Simulator;
- state parity, in `phone775` (V1) and `resize` (V2);
- `desk` / `desk900` parity is VOID, also on the card's re-run, because the logger is not stable C vs C.

Card branch 8 applies: "reported as measured; find what moved in an exploratory run; re-ticket". The exploratory
run below says the Paint movement comes from the time-driven animations, not from the side jobs (OBSERVED, in our
setup). The parity diffs look like timing races of values that are written once. Both still need a re-ticket
(P-103 rev 2) before any landing.

All loads valid: served hashes as the table, 0 page errors, all marks seen. Chrome: 4 loads per viewport (C1 V1 V2 C2,
2 holds of 2), ~57 s per load. Simulator: fw-sim 15 Pro Max 430×775 DPR 3, doc 6035, 1052 steps, 4 loads in 2 holds.

**Judged counts** (per step; every V load below every C load in every judged row):

| viewport | side rAF C → V | side rects C → V | rule |
|---|---|---|---|
| Chrome `phone` | 2.479 → 0.652 (−74 %) | 3.874 → 1.556 (−60 %) | pass |
| Chrome `phone775` | 2.320 → 0.568 (−76 %) | 3.620 → 1.355 (−63 %) | pass |
| Chrome `desk900`, `AE` only | 0.447 → 0.230 | 0.894 → 0.460 | pass |
| Chrome `desk` (equality ≤ 0.05) | 2.403 → 2.403 | 3.670 → 3.670 | pass (identical) |
| Simulator | 2.269 → 0.521 (−77 %) | 3.527 → 1.254 (−64 %) | pass |
| Chrome `resize` (reported) | 2.612 → 0.767 | 4.086 → 1.709 | n/a |

The calibration predictions (≥ 60 % / ≥ 50 % fewer) hold. Every C and V value is inside its predicted interval.
Reported, not judged:
- side job runs per step, `phone`: 2.506 → 0.678;
- FireAnimationFrame per step: `phone` 6.557 → 4.700, Simulator rAF callbacks 5.072 → 3.319;
- side `querySelector`, `phone`: 1.791 → 0.528;
- side `scrollY` reads: 0 in both arms.

**Guards** (V mean ≤ C mean + 0.05):

| | forced Layout | forced ULT / RS | Layout | ULT | PrePaint | Paint | FAF / RF |
|---|---|---|---|---|---|---|---|
| Chrome `phone` | +0.005 | −0.018 | +0.004 | −0.008 | +0.014 | **+0.090 FAIL** (C 5.694/5.503, V 5.715/5.661) | −1.857 |
| Chrome `phone775` | −0.012 | −0.006 | −0.032 | +0.001 | −0.067 | −0.144 | −1.758 |
| Chrome `desk` | −0.002 | +0.001 | +0.016 | −0.002 | +0.020 | +0.045 | +0.005 |
| Chrome `desk900` | −0.019 | −0.007 | −0.016 | 0 | −0.014 | −0.035 | −0.253 |
| Chrome `resize` | −0.003 | −0.024 | +0.007 | −0.013 | +0.008 | **+0.069 FAIL** (C 6.144/6.355, V 6.219/6.418) | −1.855 |
| Simulator | −0.041 | −0.040 (RS) | −0.072 | | | **+0.086 FAIL** (C 5.543/5.576, V 5.653/5.638) | +0.002 (RF) |

Paint's own C-vs-C spread is 0.19 (`phone`) and 0.21 (`resize`) in Chrome, 0.03 in the Simulator. The card's fixed
+0.05 is below the Chrome noise, but that is a lesson for rev 2, not a reason to pass these.

**N2, the IO trace event** (reported, not judged): `IntersectionObserverController::computeIntersections` per step,
C → V:

| `phone` | `phone775` | `desk` | `desk900` | `resize` |
|---|---|---|---|---|
| 2.186 → 2.191 | 2.198 → 2.186 | 2.126 → 2.133 | 2.138 → 2.134 | 2.380 → 2.388 |

It counts one event per frame, not per observer, so it does not show the extra observers' cost. That cost is for the
phone no-worse check.

**Parity** (state log, keyed by step, element and value; A/A = C2 vs C1):

| viewport | C2 vs C1 (A/A) | V1 beyond A/A | V2 beyond A/A | card |
|---|---|---|---|---|
| Chrome `phone` | 0 | 0 | 0 | pass |
| Chrome `phone775` | 0 | **44** | 0 | FAIL |
| Chrome `desk` | 240; re-run 205 | | | VOID twice |
| Chrome `desk900` | 242; re-run 239 | | | VOID twice |
| Chrome `resize` | 0 | 0 | **4** | FAIL |
| Simulator | 0 | 0 | 0 | pass |

What the diffs are (read from the logs):
- *`phone775` V1:* all 44 are the commission section's `--start-selling-intrinsic-block-size`: 1203 px in V1, 1166 px
  in C1, C2 and V2. Classes and steps are identical. This value is written by the engine's deferral (`sE`, JS ~2751),
  which measures the section 2 rAFs after it deactivates and writes the height once. V2 matches C, so the write
  depends on what was laid out at that moment in that load. Cause unknown; one load in four.
- *`resize` V2:* the profile shell's `is-active-shell` removal and the nav's `is-scroll-hidden is-profile-sticky-hidden`
  change happen 1 step later (1181/1189 vs 1180/1188), in the phone leg after the desktop resize. V1 matches C.
- *`desk` / `desk900` A/A:* time-eased floats (`--future-shrink`, `--profile-scale`, the profile shell's transform)
  differ in the last digits from load to load, so C vs C is above the card's 10. The logger cannot judge these
  viewports as registered.
- *Class tokens only (exploratory, not scored: classes compared, style values ignored):*
  - `phone` / `phone775`: 0 diffs.
  - `desk`: V1 has one extra one-frame nav `is-on-dark` blink at step 1687 (a jump to y 5772). V2 lacks C1's blink at
    step 1739 (a jump to y 7008).
  - `desk900`: V1 lacks C1's blink at step 1501 (a jump to y 5117).
  - `resize`: the 1-step shift above.
  - Every one is on a jump frame or right after a resize, where the deferral's render, the nav hit test and the async
    `scrollend` race.
  - The card's re-run of `desk` / `desk900` (13:33-13:45Z, same loads and order, `counts-<vp>-rerun.json`) shows C
    doing the same between its own loads:
    - `desk` re-run: C2 vs C1 moves the nav `is-on-dark` blink at step 1687 by 1-2 steps, V1 differs at 1687 and 1739
      (the steps of the first run), and V2 has 0 class diffs.
    - `desk900` re-run: V1, V2 and C2 all differ from C1 the same way at step 1501 (C1 is the odd load).
    - So the jump-frame nav blink is a pre-existing C race (OBSERVED, in our setup).
  - Judged and guard counts of the re-runs repeat the first run: `desk` side rAF 2.403 = 2.403, Paint −0.03; `desk900`
    `AE` rAF 0.447 → 0.230, Paint +0.04.

**Pixels** (`pixcheck.mjs`, V-vs-C1 ≤ C2-vs-C1 + 0.1 pp):
- First take: mobile bottom V 0.47 vs C2 0 → beyond. Desktop top 0.11 ≤ 0.16 and mobile top 0.15 ≤ 0.22 are fine.
- Re-take (card: once): mobile bottom V 0 vs C2 0.45, mobile top V 0.20 ≤ 0.21, desktop top 0.05 ≤ 0.16, everything
  else 0-0.01 → **pass**.
- The bottom-shot difference moves between the C2 and V loads. It is the colour phase of the animated gradient
  headline text ("Secure", "Organized"); the screenshots look identical to the eye.
- C1 desktop of the re-take logged one `net::ERR_HTTP2_PROTOCOL_ERROR` (a C load, the local server); V had none.

**Exploratory, not scored: where the extra Paint comes from.**
- Harness: `probe/expl-paint.mjs` (97ca1ffd33db, exploratory only), a copy of `scb-probe.mjs` that also keys every Paint event to its painted element
  (`DOM.describeNode`). One shared probe hold, `phone`, C1 V1 V2 C2.
- Totals per step: C 5.521 / 5.451, V 5.573 / 5.557. V is +0.08 again, with C-vs-C 0.07.
- By region (V − C, per step):

| region | V − C per step |
|---|---|
| countdown faces | +0.065 |
| hero | +0.076 |
| orbit cards | −0.043 |
| removed nodes | −0.042 |
| other | +0.019 |
| every side-job element (commission, pain, future, platform, profile, 45 elements) | −0.002 to +0.004 each, sum ≈ 0 |

- The positive regions are single-load outliers: the countdown faces in V2 (1971 vs about 1815 in the other three
  loads), the hero in V1 (377 vs 223-256).
- The side jobs' own elements paint the same number of times in C and V. In this run, the Paint guard moves with the
  time-driven animations (countdown, hero ring, orbit) and their phase in each load, not with the patch. OBSERVED, in
  our setup, on 2 loads per arm. The Simulator has no per-element paint data yet.

**Re-ticket proposal (P-103 rev 2, to mgmt-ops-10; to be registered before any new data):**
- *Paint guard:*
  - either exclude paints of the time-driven animations (countdown faces, hero, orbit) and keep +0.05 on the rest;
  - or judge Paint against the C-vs-C spread from ≥ 4 C loads.
- *Parity:*
  - class tokens exact, per step;
  - style values exact only for non-eased values. Eased floats are compared at a stated precision, or by the step
    they cross their end values;
  - the deferral-measured `--start-selling-intrinsic-block-size` is checked as "written in the same step", with its
    value reported;
  - A/A from ≥ 4 C loads, so a ±1-step shift on a jump frame or after a resize can be shown to be C's own.
- *Before rev 2:* an exploratory, unscored noise run, `--no-trace` C×4 at `phone775`, `desk`, `desk900` and `resize`,
  to size these numbers. No retuning on P-103's data.

## D card P-108 (P-103 rev 2; pre-registered; committed with the noise run before any P-108 load)

**Question and gate:** as P-103 (less work per scroll frame at phone widths, no more lifecycle work, identical state),
judged counts per driver step. Changes from P-103 were agreed with mgmt-ops-10 (2026-10-04, after P-103's second read).
P-103's data is not reused: every load below is new.

**1. Arms.** C = best build (65052c4a3902 / e0f92804c521), V = C + `patch-on-best.diff` (27f23f6a3878 / e0f92804c521),
built by `build.mjs` as in P-103. If the Simulator paint attribution (item 10) leads to a new V, this card is revised
with the new V hash and its build diff against 27f23f6a3878 before any load; the noise run (C only) stands.

**2. Harnesses** (sha256/12, pinned): `probe/scb-probe.mjs` ba2f8fbb5752, `simcount.mjs` 4374051b37a0, `score-p108.mjs`
4cf547f88a3b (rev of 2a408c17977a after ops pre-data read C1, see item 7e), `pixcheck.mjs` f1be95111e25, `build.mjs` 0b028c5ef8a5, `patch-on-best.diff` c2dc144b7bd2. Changes since
P-103, all equal in both arms:
- *Geometry log (both engines):* a ResizeObserver on the document element and on every top-level section (the
  children of the commission section's parent) logs `geom` = `scrollHeight` + each section's `offsetTop` and
  `offsetHeight`, as a state-log entry, whenever it changes. The observer runs after layout, so it forces none.
- *Chrome:* Paint events keyed to the painted element (`DOM.describeNode`). Reported, not judged.
- *Simulator:* one `console.timeStamp` per step, and each Timeline Paint record's clip quad is attributed to a
  top-level section by page y. Reported, not judged.

**3. Loads** (shared lane, ≤ 300 s per hold, 2 loads per hold):
- Chrome, per viewport (`phone`, `phone775`, `desk`, `desk900`, `resize` as in P-103): C1 V1 | V2 C2 | C3 V3 | V4 C4.
- Simulator: the same 8 loads in 4 holds.
- Pixels: `pixcheck.mjs` C1 V C2, both viewports, P-103's rule including one re-take.

**4. VOID per load:** as P-103 item 4.

**5. Judged:** as P-103 item 5. Every V load below every C load: `phone` / `phone775` side rAF and rects, `desk900` `AE`
rAF and rects, Simulator side rAF and rects. `desk`: |V mean − C mean| ≤ 0.05.

**6. Guards (spread rule):**
- Chrome: forced Layout, forced UpdateLayoutTree, Layout, UpdateLayoutTree, PrePaint, Paint, FireAnimationFrame.
- Simulator: RecalculateStyles, Layout, forced Layout, Paint, RenderingFrame.
- Rule, per viewport: V mean ≤ C mean + max(0.05, largest C-vs-C difference among this block's 4 C loads).
- Whole-page Paint is the judged guard number; per-element / per-section paints are reported only.
- **The Simulator leg decides on its own:** a Simulator guard fail fails the card, whatever Chrome shows.

**7. Parity** (`score-p108.mjs`; state log keyed by driver step):
- *(a) Normalisation:* class tokens exact; style declarations exact, except as follows.
  - Eased floats follow ONE rule, the rest-crossing step:
    - `--profile-scale` is "rest" (= 1) or "moving";
    - the active profile shell's `transform` is "set" or absent (`transform-origin` is dropped, it follows
      `transform`);
    - `--future-shrink` is "0", "1" or "between".
  - An entry counts only when its element's normalised state changes.
- *(b) Geometry:* `geom` entries are exact, in every viewport and in the Simulator.
- *(c) Deferral size `--start-selling-intrinsic-block-size`:* compared as "written in the same step". Its values are
  reported per load. A V value that no C load has passes only if (b) holds in that viewport with 0 `geom` diffs beyond
  A/A; otherwise it is a parity fail.
  - Mechanism note, written before data: `sE` (JS ~2751) writes it once per section, 2 rAFs after mount, from
    `getBoundingClientRect().height`. Commission's height at that moment depends on its title's line count. That
    count comes from `j()`, a `Range.getClientRects` check that the h2's ResizeObserver re-runs when the web font
    swaps. So the value depends on how far font loading has got (OBSERVED reading of the code; cause of the one
    1203 px load UNRESOLVED).
  - V's mount path is C's plus creating the gate's observers. They read nothing and write no style.
  - The CSS uses `contain-intrinsic-block-size: auto var(...)`. The length applies only while the section has no
    last remembered size, and a section measured while rendered normally has one. CONFIRMED (spec rule): CSS
    Sizing 4, "Last Remembered Size" / `contain-intrinsic-size: auto <length>`,
    https://drafts.csswg.org/css-sizing-4/#last-remembered. Whether this page's sections always have one at that
    moment is what (b) checks.
- *(d) A/A:* a V diff (vs C1) is A/A only when the identical entry appears in some C-vs-C1 diff. The C loads are this
  block's C2-C4 plus the noise run's 4 C loads (same harness, diffed against this block's C1). A ±1-step shift is
  therefore A/A only when some C load shows the same shift at the same event.
- *(e) VOID:* a viewport's parity is VOID when any of this block's C-vs-C1 pairs has more than N_vp normalised
  diffs. N_vp = 2 × (largest normalised C-vs-C pair diff in the noise run for that viewport) + 5:

| | `phone` | `phone775` | `desk` | `desk900` | `resize` | Sim |
|---|---|---|---|---|---|---|
| largest noise C-vs-C pair | 0 | 0 | 7 | 0 | 2 | 0 |
| N_vp | 5 | 5 | 19 | 5 | 9 | 5 |

  These values are frozen inside `score-p108.mjs` (`N_VP`, a const map per viewport); there is no `--void-n` flag (it
  exits 2 if given), and a viewport with no frozen value throws. Exact scoring command for the P-108 loads, run once
  after the last load: `node fixes/scroll-cb-phone/score-p108.mjs out/scroll-cb-phone/p108 --aa-extra
  out/scroll-cb-phone/noise --json out/scroll-cb-phone/p108/score.json`. Without `--aa-extra` (or with a missing dir) the
  scorer exits 2. Each guard row prints V − C (`d`) next to its tolerance (`tol`) and limit, pass or fail.
  The noise run was scored with 2a408c17977a; 4cf547f88a3b changes only flags, the VOID gate and printing, and gives the
  same numbers on `out/scroll-cb-phone/noise --noise`.

  Outcome: VOID = parity not shown = not landable on P-108, with no re-run on the same harness.
- *(f) Pixels:* as P-103 item 7. No new page errors in V.

**8. Outcomes:**
- *Pass* (judged, equality, every guard, parity and pixels): phone no-worse ticket from ops, then `patch.diff` and the
  land request.
- *Anything else:* not landable on P-108, reported as measured.

**9. Noise run (item d, C only, not scored, committed with this card):** the tables below, from the same harnesses:
4 C loads per Chrome viewport and 4 in the Simulator. They set N_vp and show the spreads the rule in item 6 will meet.

- Run: `out/scroll-cb-phone/run-noise.sh`, 2026-10-04 14:11-15:44Z, C only (JS 65052c4a3902, CSS e0f92804c521), 2 shared
  holds per Chrome viewport (weight probe) and 2 Simulator holds (weight simulator). Every load: 0 page errors, the
  same step count within its viewport. Scored with `score-p108.mjs --noise` (pinned hash), output
  `out/scroll-cb-phone/noise/score.json`.
- Guard spreads (max − min over the 4 C loads, per step). The item 6 tolerance in P-108 comes from P-108's own 4 C
  loads; these show what to expect. "tol" = max(0.05, spread):

| guard (per step) | `phone` | `phone775` | `desk` | `desk900` | `resize` |
|---|---|---|---|---|---|
| forced Layout | 0.249 ± 0.060 | 0.245 ± 0.008 | 0.286 ± 0.001 | 0.312 ± 0.005 | 0.325 ± 0.006 |
| forced UpdateLayoutTree | 0.888 ± 0.025 | 0.857 ± 0.016 | 1.261 ± 0.020 | 1.163 ± 0.008 | 0.973 ± 0.022 |
| Layout | 0.488 ± 0.021 | 0.453 ± 0.029 | 0.493 ± 0.034 | 0.545 ± 0.031 | 0.625 ± 0.022 |
| UpdateLayoutTree | 1.445 ± 0.042 | 1.410 ± 0.013 | 1.768 ± 0.024 | 1.690 ± 0.002 | 1.608 ± 0.025 |
| PrePaint | 2.426 ± 0.074 | 2.456 ± 0.061 | 2.007 ± 0.034 | 1.969 ± 0.061 | 2.742 ± 0.038 |
| **Paint** (judged guard) | 5.592 ± 0.203 | 5.276 ± 0.273 | 3.423 ± 0.104 | 3.166 ± 0.072 | 6.174 ± 0.374 |
| FireAnimationFrame | 6.561 ± 0.045 | 6.286 ± 0.056 | 6.079 ± 0.025 | 6.228 ± 0.041 | 6.851 ± 0.039 |

  (cells: C mean ± spread). Judged side counts in C (rAF / rects per step) vary by ≤ 0.026 between C loads
  (`desk900`: AE 0.447 / 0.894, spread 0).

| Simulator guard (per step) | C mean | spread |
|---|---|---|
| RecalculateStyles | 1.483 | 0.019 |
| Layout | 3.690 | 0.020 |
| forced Layout | 2.480 | 0.039 |
| **Paint** | 5.553 | 0.066 |
| RenderingFrame | 0.915 | 0.042 |

  Sim paints by section, C1-C4 (reported only): hero-track 780 / 767 / 736 / 738, people 368 / 350 / 362 / 351,
  pain 1765 / 1758 / 1765 / 1759, platform 975 / 973 / 963 / 966, commission 305 / 311 / 315 / 316, outside
  1694 / 1682 / 1682 / 1688. Side rAF / rects per step 2.269 / 3.527 in all 4.
- Normalised parity, C2-C4 vs C1 (these are the noise loads that item 7(d) adds to the A/A set):

| | `phone` | `phone775` | `desk` | `desk900` | `resize` | Sim |
|---|---|---|---|---|---|---|
| C2 / C3 / C4 vs C1 | 0 / 0 / 0 | 0 / 0 / 0 | 3 / 7 / 0 | 0 / 0 / 0 | 0 / 2 / 0 | 0 / 0 / 0 |

  - `desk`: all 3 + 6 of the 7 diffs are the nav `is-on-dark` blink at steps 1687/1739 (dropped for one step, back
    the next), the same race P-103's desk re-run showed in C alone; the 7th is future's deferral written one step
    later (1746). Pre-existing in C (OBSERVED).
  - `resize` C3: one `geom` change at step 1215, 1 px in `people` / `pain` / `commission` offsets. In that load
    commission's deferral was **1202.97 px**, the other 3 loads 1166.17 px. So the 1203 value that failed P-103's
    phone775 V1 also occurs in C (OBSERVED, consistent with the font-race reading in item 7(c)).
- Deferral values seen in C: commission 1166.17 (`phone`, `phone775`, `resize`), 1202.97 (`resize` C3), 1002
  (`desk`), 762.59 (`desk900`), 1197.38 (Sim); future 1327.88 (`phone`, `phone775`, `resize`), 4084.20 (`desk`),
  4070.40 (`desk900`), 1326.73 (Sim).

**10. Simulator paint attribution (exploratory under P-103 branch 8, before this card's data; not scored).**
- Run: `simcount.mjs` with the item 2 additions, C1 V1 V2 C2, 2 Simulator holds (13:58-14:12Z), `sim-expl.json`.
- The section names in that run were cut at the letter "s" by a regex escape bug in the page script (e.g. "commi").
  That bug is fixed in the pinned hash; the counts are unaffected.
- Whole-page Paint per step: C 5.597 / 5.540, V 5.580 / 5.519. V is *lower* this time, so P-103's Simulator
  +0.086 did not repeat. The C-vs-C spread is 0.057 here (0.033 in P-103).
- Paints by top-level section (clip-quad centre + the driver's y):

| section | C1 | V1 | V2 | C2 |
|---|---|---|---|---|
| hero-track | 763 | 801 | 671 | 695 |
| people (future) | 362 | 331 | 345 | 358 |
| pain | 1764 | 1762 | 1789 | 1792 |
| commission | 313 | 314 | 312 | 309 |
| platform | 974 | 976 | 986 | 968 |
| outside (nav / fixed layers) | 1712 | 1686 | 1703 | 1706 |

- Commission and platform paint the same in C and V. The largest load-to-load swings are in the hero
  (countdown / ring), in both arms.
- No new V is needed. P-108 judges the Simulator Paint guard by the item 6 rule from its own 4 C loads.
- Parity in this run: V1 and V2 vs C1 0 diffs, C2 vs C1 0, including the new `geom` entries.

## P-108 result

Ops pre-data read: FAIL at 4354a187 (one VOID limit for all viewports), PASS at 23940497 (N_vp frozen per viewport).
Harness pins re-checked before the first load: all six match item 2.

**Chrome** (`out/scroll-cb-phone/run-p108-chrome.sh`, 20 shared probe holds, 40 loads, 0 page errors, equal step
counts per viewport; JS C 65052c4a3902 / V 27f23f6a3878, CSS e0f92804c521; scored with the item 7e command):

| viewport | judged (C mean → V mean, per step) | judged | Paint V−C (tol) | other guards | max C-vs-C1 (N_vp) | parity beyond A/A (geom) |
|---|---|---|---|---|---|---|
| `phone` | side rAF 2.482 → 0.655, rects 3.881 → 1.564 | PASS (below every C) | +0.043 (0.112) | PASS | 0 (5) | 0 / 0 / 0 / 0 (0) |
| `phone775` | side rAF 2.310 → 0.568, rects 3.597 → 1.355 | PASS | −0.071 (0.297) | PASS | 0 (5) | 0 / 0 / 0 / 0 (0) |
| `desk` | side rAF 2.398 = 2.398, rects 3.659 = 3.659 | PASS (equal) | +0.001 (0.05) | PASS | 0 (19) | 0 / 0 / 0 / 0 (0) |
| `desk900` | AE rAF 0.447 → 0.230, rects 0.894 → 0.460 | PASS | +0.010 (0.114) | PASS | 0 (5) | 0 / 0 / 0 / 0 (0) |
| `resize` | side rAF 2.611 → 0.767, rects 4.084 → 1.708 (reported) | report | −0.038 (0.05) | PASS | 1 (9) | 0 / 0 / 0 / 0 (0) |

- FireAnimationFrame per step drops by about 1.8 at `phone`, `phone775` and `resize`, and by 0.23 at `desk900`.
- No viewport is VOID. Deferral sizes: every V value is one C wrote, except `resize` V3's commission 1202.97 px. That
  value appears in the noise run's C3; V3's one diff is the same step-1215 `geom` entry this block's C3 differs on
  (A/A), so `geom` beyond A/A is 0 and item 7(c) passes it.
- Chrome legs: PASS.

**Simulator (iOS Simulator, WebKit counts; 8 loads in 4 exclusive `--no-timing` holds, C1 V1 | V2 C2 | C3 V3 | V4 C4;
valid C 4, V 4):**

| metric per step | C mean (spread) | V mean | V − C (tol) | verdict |
|---|---|---|---|---|
| side rAF | 2.269 (0) | 0.521 | −1.748 | PASS (below every C) |
| side rects | 3.527 (0) | 1.254 | −2.273 | PASS (below every C) |
| styleRecalcs | 1.533 (0.069) | 1.488 | −0.045 (0.069) | guard PASS |
| layouts | 3.730 (0.081) | 3.700 | −0.030 (0.081) | guard PASS |
| forcedLayouts | 2.510 (0.063) | 2.496 | −0.014 (0.063) | guard PASS |
| **paints (judged)** | 5.552 (0.110) | 5.511 | **−0.041 (0.110)** | guard PASS |
| renderingFrames | 0.925 (0.022) | 0.904 | −0.020 (0.05) | guard PASS |

- Parity: max C-vs-C1 0 (N_vp 5), V1-V4 0 diffs, 0 beyond A/A, 0 geom; every V deferral value is one C wrote. Not VOID.
- Paints by section (reported) stay within the C range in every section (commission 310-313 V vs 312-317 C).

**Pixels (`pixcheck.mjs`, headless, C1 V C2, CHECK OK, no new console errors or 404s):** % of pixels vs C1:

| | V top / middle / bottom | C2 top / middle / bottom |
|---|---|---|
| mobile | 0.07 / 0.01 / 0 | 0.10 / 0.01 / 0 |
| desktop | 0.06 / 0 / 0 | 2.53 / 0 / 0 |

V is inside the 0-0.4 % phase-noise band everywhere; the one larger value is C2 against C1 (same build, A/A: the hero's
animation phase at the top shot), so it says nothing about V.

Final score, exact card 7e command (`score.json` in `out/scroll-cb-phone/p108/`): Paint d (tol) phone +0.043 (0.112),
phone775 −0.071 (0.297), desk +0.001 (0.05), desk900 +0.010 (0.114), resize −0.038 (0.05), sim −0.041 (0.110); every
guard passes, parity passes, nothing VOID.

**P-108: PASS** (Chrome, Simulator, pixels). `patch.diff` (against the baseline, via `fix.mjs diff`) is committed with
this result.

Next (lead, 2026-10-05): one combined ticket from mgmt-ops-10, v8 vs v8 + nav-hit-cache + scroll-cb, after P-116. It
covers this fix's phone no-worse check (less-work rule) and the combined-build parity check with nav-hit-cache (item 9
of P-103) in one block. int-v8 carries `patch-on-best.diff` onto v8 (P-108's C is morph-gpu rev 3, 65052c4a3902, not
v8).

## Risks, conflicts, follow-ups

- Up to 12 extra IntersectionObservers on phones (commission 4, future 6, platform 2). Their cost is not in these counts
  (see 5); the phone no-worse check is where it would show.
- The residual above (stale `poke` + sudden non-scroll layout shift) is not exercised by the driver.
- Reduced motion: the jobs' reduced-motion listeners now call the same trampolines (`scbRun`, `scbProfWake`), so a
  change still runs each job once.
