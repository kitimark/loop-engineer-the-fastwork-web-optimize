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
| `probe/scb-probe.mjs` | 109c8d62810b | Chrome: rAF-request / rect / scrollY counter, trace counter (forced layout, lifecycle), per-frame state logger |
| `simcount.mjs` | 6af68099ea53 | Simulator (WebKit): the same counters and state logger, Timeline counts |
| `pixcheck.mjs` | f1be95111e25 | pixel diff: `tools/check.mjs` (5fc6b9180ae6 on main at this card) on C1, V, C2 |

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

To be filled: C only, one load, to check the harness before C/V data (as P-101 did). Not part of P-103's loads.

## Risks, conflicts, follow-ups

- Up to 12 extra IntersectionObservers on phones (commission 4, future 6, platform 2). Their cost is not in these counts
  (see 5); the phone no-worse check is where it would show.
- The residual above (stale `poke` + sudden non-scroll layout shift) is not exercised by the driver.
- Reduced motion: the jobs' reduced-motion listeners now call the same trampolines (`scbRun`, `scbProfWake`), so a
  change still runs each job once.
