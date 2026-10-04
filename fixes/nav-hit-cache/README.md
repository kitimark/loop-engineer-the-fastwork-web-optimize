# Fix: nav-hit-cache

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch-on-best.diff` and `patch.diff` contain excerpts of Fastwork's code: keep them on local branches,
> never push.

**Status:** P-104 failed on parity; diagnosed (harness lag and phase, plus one real trigger bug, fixed); P-107 (successor) PASS on every part: judged counts lower, guards and Simulator no worse, task-mode parity 0 in all 5 cases.
P-117 owed checks on the combined V (v8 + nav-hit-cache + scroll-cb, JS e8d8323f674b): parity PASS in all 5 cases (task 0/0), Simulator momentum case below
**Stage:** D done (P-107, v8 base); P-117 combined-build checks done (section "P-117 owed checks"); with PR-018 rev 7c a combined build sets `__nsForce = !0`
**Device class / gate:** less-work fix (memory `less-work-landing-rule`): Chrome + Simulator work counts, then one short
phone no-worse check
**Driver(s) behind the claims:** Chrome scripted scroll (counts only), Simulator scripted scroll (counts only)
**Prediction:** `fixes/PREDICTIONS.md` P-101 (the D card below)
**Source:** frame audit §5 item 1 (`research/design-engineering/frame-audit.md`, user T-100); carries N12 v5
(`fixes/nav-scroll-handler/`, never landed) forward onto the best build, with v5's 1 s hot timer replaced
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, the nav component only (`dN`): `F()`'s neighbour
`__navProbeY()`, the state block before `_`, `_` itself, setup and cleanup of the same effect. No CSS change.

## Why it lags (R)

- On every scroll frame, top to bottom of the page and on phones too, the nav's scroll callback `_` (registered with
  `dE(L)`, no element, so no gate) does:
  - `ee()`: a `getComputedStyle` and 2 rects (is the profile sticky stuck?);
  - `F()`: an `elementsFromPoint` hit test at the nav's centre line (is the section under the nav dark?);
  - one more rect for the hero-pill progress.
- In Blink, `elementsFromPoint` runs the document lifecycle up to pre-paint (UpdateAllLifecyclePhasesExceptPaint, CONFIRMED
  in the frame audit §4.4). Other callbacks have written styles earlier in the same frame, so this is a forced style +
  layout + pre-paint pass. The frame audit counted PrePaint at 126-128/s during a 60 fps scroll in both the baseline and
  the best build: about two pre-paint passes per frame (frame audit §2.1, row S1).
- The answer changes only near section borders, so almost every one of those passes is wasted.
- WebKit: whether its hit test also forces layout here is UNRESOLVED. The Simulator part of the ticket is the decisive
  local check.

## What changed (I)

`patch-on-best.diff` (against the best build `65052c4a3902` / `e0f92804c521`; `build.mjs` applies it). The nav decides
its state from cached geometry and the scroll position, and runs the real hit test only when the answer can have changed.

- **Cached geometry.** `__nsMeasure()` reads the document offsets once:
  - the hero track;
  - the edges of the theme sections the hit test can return;
  - the profile-sticky window (from the section top);
  - the probe line.
  It re-measures on:
  - a ResizeObserver on `<html>` and `.start-selling` (html/body are `height: 100%`, so the root alone never grows);
  - the breakpoint media queries;
  - `fonts.ready`;
  - resize.
- **Scroll position.** Taken from a passive `scroll` listener, so no layout read per frame.
- **Hero pill.** The same formula from the cached track: `scrollY - trackTop >= 0.72 * max(1, trackH - innerHeight)`.
- **Profile sticky.** No `getComputedStyle` per frame:
  - phones: not sticky, so no reads at all;
  - desktop: the same two rect reads as `ee()`, only inside a window around the section.
- **Theme (on-dark).** The real hit test `F()` runs only in frames where:
  - a re-measure happened, or a class changed on the theme sections or the nav (class names compared as strings, no
    layout);
  - the probe line crosses a cached edge (±12 px);
  - the probe line is inside a section whose shrink/enter class is on (sticky + scaled content moves the boundary
    without layout);
  - the morph is active;
  - a geometry transition runs in the theme sections or on the nav;
  - a transition ended in this frame.
  Otherwise the last answer stands.
- **Transitions (new since v5).** They are tracked with `transitionrun` / `transitionend` / `transitioncancel` (capture,
  paint-only properties ignored). In continuous scrolling, v5's "keep testing for 1 s after any test" timer kept the hit
  test running every frame, so v5 saved no hit tests (`fixes/nav-scroll-handler/README.md`).
- **Probe line.** Re-read after each real test (the layout is clean then), because the nav slides up when scroll-hidden.

What stays identical: the same three state signals (`v`, `g`, `p`) are written through the same `z()` calls. Only how
often their inputs are recomputed changes. Pixel identity therefore reduces to class identity, frame by frame. The
parity part below checks it in every cached frame against the real hit test.

## Boundaries agreed with fix-scroll-cb (2026-10-04)

- **Mine:** `dN`, `_` / `F` / `ee`, and the nav's `dE(L)` registration.
- **Theirs:** the commission `a`/`o`, future `l`/`u`, platform `n`/`r` and profile `f`/`m` callbacks, with all their
  `dE` call sites.
- **Shared, ask first:** the engine (`dE`, `rE`, `iE`, `aE`, `uE`). This fix does not touch it.
- **What I rely on.** I read the classes they flip (`shrinking` / `entering`, `is-pain-dark`, `is-platform-shrinking`,
  future `is-visible`). They keep those flips in the same frame and the same order, and they tell me before any timing
  change.

## D card P-101 (pre-registered; committed before its data)

**Question.** During a scripted scroll from the top to the bottom of the full page, does V make Chrome do fewer
pre-paint passes and fewer forced layouts per scroll frame than C? Does it do no more work in the Simulator? Does it
keep the nav state identical in every frame?

**Gate.** The less-work landing rule (T-029 #30): judged counts per event, and the event is one scroll frame (one
stepper step of 10 px). Counts are taken on the full page. No smoothness claim is made.

**Arms** (sha256/12 of the JS node / CSS, checked as served; a load that serves other hashes is VOID).

| arm | what | `2.DyWL8TcE.js` | `2.gBuqKVzi.css` |
|---|---|---|---|
| C | the best build (`out/snapshots/best-65052c4a3902`) | 65052c4a3902 | e0f92804c521 |
| V | C + `patch-on-best.diff` (the landing build, no debug code) | aa3ea472d26b | e0f92804c521 |
| VA | V + the in-frame audit hook (DEBUG ONLY, parity part only, never lands) | a01a2ef32db0 | e0f92804c521 |

All arms are on the snapshot pinned by this branch's `baseline.json`. `node fixes/nav-hit-cache/build.mjs` rebuilds V
and VA from the committed diff and prints the table.

**Harnesses** (committed here with this card; sha256/12: `build.mjs` 31379fa08c89, `probe.mjs` c8630550a06b,
`simcount.mjs` 58fc44c464a2, `patch-on-best.diff` 60d5d0f183b6; any later harness change is listed with its new hash
and what it changes, before its data):
- *Harness change 1 (before any V data, after the ops read at 11e26713):* `probe.mjs` gets an `--arms` filter
  (default `C,V`, so the counted loads are unchanged) for the C-only harness smoke. Nothing it counts changed. New
  `probe.mjs` hash: in the commit that carries this line, listed under "Smoke" below.
- `probe.mjs count` (Chrome):
  - headless, no CPU throttle; mobile 430×932 DPR 3 touch, and desktop 1440×900;
  - plain served build (`serve.mjs --https --vendors=local --no-cache`);
  - one trace per load (`devtools.timeline` + frame categories) over a scripted scroll from the top to the bottom,
    10 px per rAF;
  - per step: PrePaint, UpdateLayoutTree, Layout, Paint, each split into **forced** (inside a FunctionCall /
    FireAnimationFrame / EventDispatch / TimerFire / RunMicrotasks event) and **frame** (the frame's own lifecycle);
  - API calls from the nav code region (`getBoundingClientRect`, `getComputedStyle`, `elementsFromPoint`), counted by a
    wrapper that reads the call stack line.
- `probe.mjs parity` (Chrome):
  - **audit (VA):** in every frame where V keeps its cached answer, the hook also runs the real `F()` and records a
    mismatch. Continuous scroll down, then up, at 10 and at 40 px per rAF.
    Cases: mobile, desktop, desktop-rtl, mobile-rtl, and mobile-shift (a 300 px block inserted above the theme sections
    mid-page, with no resize).
  - **states (C vs V):** the nav's state classes after settling at about 60 positions down and every third back up,
    in the same 5 cases.
- `simcount.mjs` (Simulator, WebKit):
  - functional session, plain http, a new port per load;
  - a Timeline window over the same scripted scroll, 10 px per rAF, top to bottom;
  - counts RenderingFrame, RecalculateStyles, Layout, Paint, plus RecalculateStyles / Layout nested inside a script
    record (forced).

**Loads and order.** 2 loads per arm and viewport, in the order C1 V1 V2 C2.
- Chrome counts: one shared-lane probe hold per viewport (`--vp mobile`, then `--vp desktop`), at most 300 s each.
- Parity: shared-lane probe holds split by case (`--cases`), at most 300 s each.
- Sim: one `simulator` hold, `C:1 V:1 V:2 C:2`.
- Output: `out/nav-hit-cache/` (gitignored). The scored summary and the JSON records are committed after scoring.

**VOID** (per load):
- the load errored;
- the trace marks are missing, or the step count is below 300;
- the served hashes differ from the table;
- a page error in V that C does not have.

An engine with fewer than 2 valid loads per arm and viewport is re-run with new loads in the same order, and the re-run
is reported.

**Counts and verdicts.**
- *Judged, Chrome (must be lower in both viewports, every V load below every C load):*
  - PrePaint per step (total);
  - forced Layout per step;
  - nav `elementsFromPoint` per step;
  - nav `getComputedStyle` per step.
- *Guards, Chrome (must be no worse; V mean ≤ C mean + 0.05 per step):*
  - Layout per step (total): the layout moves from forced to the frame's own pass, it does not vanish;
  - UpdateLayoutTree per step;
  - Paint per step.
- *Judged, Simulator (must be no worse; V mean ≤ C mean + 0.05 per step):* RecalculateStyles, Layout, RenderingFrame.
  - Forced Layout per step is **reported as the answer to the UNRESOLVED WebKit question**: lower in V means WebKit's
    hit test forced a layout here too; equal means it did not. Either way the Simulator is not a gain gate.
- *Parity (must hold):*
  - audit mismatches = 0 in every case and both speeds;
  - state mismatches C vs V = 0 in every case;
  - no new page errors.

**Predictions** (intervals; per scroll step of 10 px):

| count | C | V |
|---|---|---|
| Chrome PrePaint per step, mobile and desktop | 1.8 to 2.3 | C minus 0.4 to 0.95 |
| Chrome forced Layout per step | 0.9 to 2.5 | C minus 0.3 to 1.0 |
| Chrome forced PrePaint per step | 0.9 to 1.1 | 0.03 to 0.5 |
| nav `elementsFromPoint` per step | 0.95 to 1.05 | 0.03 to 0.5 (= the share of steps that still test) |
| nav `getComputedStyle` per step | 0.95 to 1.05 | 0 (only at re-measures, under 0.02) |
| Chrome Layout / UpdateLayoutTree / Paint per step, total | as measured | within ±0.05 of C |
| Sim forced Layout per step | 0 to 1.2 | 0 to C (no prediction on the size: UNRESOLVED) |
| Sim RecalculateStyles / Layout / RenderingFrame per step | as measured | within ±0.05 of C |

**What happens next, whatever the result.**
- *Pass:* the Chrome judged counts are lower, the guards and the Sim are no worse, and parity holds. Next: one short
  phone no-worse check (scripted S, 1 warm-up + C V V C on the current best phone ticket, the lead's slot). Then a land
  request with `patch.diff` (against the baseline, via `node tools/fix.mjs diff`).
- *Parity fails:* not landable. Fix the trigger that missed (the audit names the scrollY and the answer), re-ticket, and
  re-run all parts.
- *Judged Chrome counts lower, but a guard or the Sim is worse (V mean > C mean + 0.05 per step):* not landable as a
  less-work fix. Report it as measured, find what moved (for example in an exploratory VA run), and re-ticket. No
  retuning on this card's data.
- *Counts not lower:* report it as the measured outcome, look at which trigger keeps the test on (a per-trigger tally in
  an exploratory VA run), and re-ticket. No retuning against this card's data.

## P-101 results, Chrome counts (owner's reading; ops re-scores from `p101/`)

Chrome mobile and desktop are done, 4 valid loads each (C1 V1 V2 C2). Served hashes match the card; no page errors.
Parity (3 holds) and the Simulator were queued after them. They were stopped before they started, for the lead's usage
pause (10-04 ~11:25Z), and still owe their data.

| per scroll step (10 px) | mobile C | mobile V | desktop C | desktop V | judged / guard | result |
|---|---|---|---|---|---|---|
| PrePaint, total | 2.234 / 2.211 | 1.882 / 1.871 | 1.811 / 1.818 | 1.693 / 1.688 | judged, lower | lower, separated (predicted −0.4 to −0.95: **miss**, −0.35 / −0.12) |
| Layout, forced | 0.381 / 0.385 | 0.385 / 0.391 | 0.353 / 0.349 | 0.356 / 0.351 | judged, lower | **not lower** (+0.005 / +0.003) |
| nav elementsFromPoint | 0.998 / 0.998 | 0.643 / 0.641 | 0.999 / 0.999 | 0.673 / 0.675 | judged, lower | lower (V predicted 0.03 to 0.5: **miss**) |
| nav getComputedStyle | 0.998 / 0.998 | 0 / 0 | 0.999 / 0.999 | 0.001 / 0 | judged, lower | lower (hit) |
| Layout, total | 0.452 / 0.456 | 0.456 / 0.462 | 0.399 / 0.396 | 0.402 / 0.398 | guard, ≤ C + 0.05 | holds |
| UpdateLayoutTree, total | 1.372 / 1.402 | 1.368 / 1.402 | 1.587 / 1.595 | 1.593 / 1.600 | guard | holds |
| Paint, total | 4.090 / 4.067 | 3.916 / 4.071 | 2.517 / 2.507 | 2.418 / 2.521 | guard | holds |
| PrePaint, forced (reported) | 0.998 / 0.998 | 0.643 / 0.641 | 0.664 / 0.664 | 0.510 / 0.514 | – | – |
| nav rects (reported) | 1.996 | 1.286 / 1.282 | 3.995 | 2.664 / 2.651 | – | – |

**Reading (owner's; ops scores it).** P-101 does not pass as registered: forced Layout per step is not lower on either
viewport.
- The nav hit test did not cause those forced layouts. In C, the other scroll callbacks' rect reads had already brought
  layout up to date before `F()` ran, so skipping `F()` removes a forced style and pre-paint pass but no layout. The C
  interval for forced Layout (0.9 to 2.5) was also too high (smoke: 0.38).
- What V does cut, with every V load below every C load:
  - one pre-paint pass in about a third of all scroll frames: −0.35 per step on mobile, −0.12 on desktop;
  - every per-frame getComputedStyle;
  - a third to a half of the nav's rect reads.
- V still runs the real hit test in 64-67 % of steps, far above the 3-50 % predicted. Some trigger stays on for long
  stretches: a long moving zone, or a transition that restarts every frame. The card's next step for "counts not
  lower" is an exploratory per-trigger tally (a VA-like hook) and a re-ticket. That is paused for the usage pause.

## D card P-104 (rev 2 of P-101; pre-registered, committed before its data)

**Why a rev 2.** The lead ruled on 10-04: P-101 fails as registered, because forced Layout is not lower. P-104 judges
the four counts the fix is built to cut, and keeps forced Layout as a guard. It needs fresh loads, and the P-101 loads
do not count. Each viewport is predicted on its own. Parity (3 holds) and the Simulator are owed either way. Ops owns
the PREDICTIONS.md row.

**Question.** During a scripted scroll from the top to the bottom of the full page, does V make Chrome do fewer pre-paint
passes and fewer nav hit-test reads per scroll frame than C, without more layout, style or paint work? Does it do no
more work in the Simulator? Does it keep the nav state identical in every frame?

**Gate.** As P-101: the less-work landing rule (T-029 #30). Judged counts are per scroll frame (one 10 px stepper
step) on the full page. No smoothness claim.

**Arms.** The same as P-101, unchanged and checked as served: C 65052c4a3902 / e0f92804c521, V aa3ea472d26b /
e0f92804c521, VA a01a2ef32db0 / e0f92804c521 (VA is parity only). `node fixes/nav-hit-cache/build.mjs` rebuilds V and
VA from the committed diff and prints these hashes.

**Harnesses.** Unchanged since P-101's harness change 1 (sha256/12):

| file | hash |
|---|---|
| `build.mjs` | 31379fa08c89 |
| `probe.mjs` | 506d1f0397d7 |
| `simcount.mjs` | 58fc44c464a2 |
| `patch-on-best.diff` | 60d5d0f183b6 |

The parts (`probe.mjs count`, `probe.mjs parity`, `simcount.mjs`) and their settings are as described in P-101. Any
later harness change is listed here with its new hash, before its data.

**Loads and order.** Fresh loads, 2 per arm and viewport, in the order C1 V1 V2 C2.
- Chrome counts: one shared-lane probe hold per viewport (`count --vp mobile`, then `count --vp desktop`), at most 300 s
  each.
- Parity, 3 shared-lane probe holds:
  1. `--cases mobile,desktop`;
  2. `--cases desktop-rtl,mobile-rtl`;
  3. `--cases mobile-shift`.
- Simulator: one `simulator` hold, `C:1 V:1 V:2 C:2`.
- Raw output goes to `out/nav-hit-cache/p104/` (gitignored). The JSON records are committed to `fixes/nav-hit-cache/p104/`
  after scoring.

**VOID** (per load): as P-101.
- the load errored;
- the trace marks are missing, or the step count is below 300;
- the served hashes differ from the arms;
- V has a page error that C does not have.

An engine with fewer than 2 valid loads per arm and viewport is re-run with new loads in the same order, and the re-run
is reported.

**Counts and verdicts.**
- *Judged, Chrome.* Each must be lower in both viewports, with every V load below every C load in that viewport:
  - PrePaint per step (total);
  - forced PrePaint per step;
  - nav `elementsFromPoint` per step;
  - nav `getComputedStyle` per step.
- *Guards, Chrome.* Each must be no worse, V mean ≤ C mean + 0.05 per step, in each viewport:
  - forced Layout per step;
  - Layout per step (total);
  - UpdateLayoutTree per step;
  - Paint per step.
- *Simulator.* Must be no worse, V mean ≤ C mean + 0.05 per step: RecalculateStyles, Layout, RenderingFrame. Forced
  Layout per step is reported as the answer to the UNRESOLVED WebKit question, not judged.
- *Parity.* Must hold:
  - audit mismatches = 0 in every case, at both speeds;
  - state mismatches C vs V = 0 in every case;
  - no new page errors.

**Predictions** (intervals per 10 px scroll step; each viewport on its own):

| count | mobile C | mobile V | desktop C | desktop V |
|---|---|---|---|---|
| PrePaint, total | 2.15 to 2.30 | 1.80 to 1.95 | 1.75 to 1.88 | 1.63 to 1.76 |
| PrePaint, forced | 0.95 to 1.05 | 0.58 to 0.70 | 0.60 to 0.72 | 0.46 to 0.57 |
| nav `elementsFromPoint` | 0.95 to 1.05 | 0.58 to 0.70 | 0.95 to 1.05 | 0.62 to 0.73 |
| nav `getComputedStyle` | 0.95 to 1.05 | 0 to 0.02 | 0.95 to 1.05 | 0 to 0.02 |
| Layout, forced (guard) | 0.33 to 0.43 | C ± 0.03 | 0.30 to 0.40 | C ± 0.03 |
| Layout / UpdateLayoutTree / Paint, total (guards) | as measured | within ±0.05 of C | as measured | within ±0.05 of C |

- Simulator:
  - RecalculateStyles, Layout and RenderingFrame per step: C as measured, V within ±0.05 of C;
  - forced Layout: V from 0 to C, with no prediction on the size.
- Parity: 0 audit mismatches and 0 state mismatches in all 5 cases.

**What happens next, whatever the result.**
- *Pass* (judged counts lower, guards and Simulator no worse, parity holds): next is the short phone no-worse check.
  It needs its own ops ticket: scripted S, 1 warm-up plus C V V C, in the lead's slot. Then a land request with
  `patch.diff`.
- *Parity fails:* not landable. Fix the trigger that missed (the audit names the scrollY and the answer), re-ticket,
  and re-run all parts.
- *Judged counts lower, but a guard or the Simulator is worse:* not landable as a less-work fix. Report it as measured,
  find what moved in an exploratory VA run, and re-ticket. No retuning on this card's data.
- *A judged count not lower:* report it as the measured outcome, and re-ticket. No retuning against this card's data.
- *In every case:* the per-trigger tally (why V still tests in about 65 % of steps) runs only after P-104's data, as an
  exploratory VA-like run. It never changes V under this card.

## P-104 results (owner's reading; ops re-scores from `p104/`)

The pre-data read passed (mgmt-ops-10, ledger dccc727c). All parts ran on 10-04, 12:51-13:19Z, in shared slots. Every
load served the card's hashes, no load is VOID, and there are no page errors.

**Verdict: P-104 fails on parity, so V is not landable.** The counts pass.

| per scroll step (10 px), loads C1 / C2 and V1 / V2 | mobile C | mobile V | desktop C | desktop V | rule | result |
|---|---|---|---|---|---|---|
| PrePaint, total | 2.221 / 2.215 | 1.877 / 1.869 | 1.822 / 1.838 | 1.691 / 1.689 | judged | lower, separated |
| PrePaint, forced | 0.998 / 0.998 | 0.641 / 0.641 | 0.663 / 0.664 | 0.512 / 0.511 | judged | lower, separated |
| nav elementsFromPoint | 0.998 / 0.998 | 0.641 / 0.641 | 0.999 / 0.999 | 0.673 / 0.672 | judged | lower, separated |
| nav getComputedStyle | 0.998 / 0.998 | 0 / 0 | 0.999 / 0.999 | 0.001 / 0.001 | judged | lower, separated |
| Layout, forced | 0.383 / 0.387 | 0.383 / 0.379 | 0.356 / 0.355 | 0.351 / 0.350 | guard | holds |
| Layout, total | 0.454 / 0.458 | 0.454 / 0.450 | 0.402 / 0.401 | 0.398 / 0.396 | guard | holds |
| UpdateLayoutTree, total | 1.361 / 1.406 | 1.378 / 1.396 | 1.592 / 1.599 | 1.589 / 1.600 | guard | holds |
| Paint, total | 4.011 / 4.080 | 4.077 / 4.052 | 2.567 / 2.503 | 2.393 / 2.497 | guard | holds (mobile V mean +0.019) |

- **Predictions:** every judged and guard count falls inside its interval. Ops' N1 applies: the intervals were set
  after P-101's data, so the hits are a replication on fresh loads.
- **Simulator** (per step, C1 / C2 vs V1 / V2): no worse.
  - RenderingFrame 0.970 / 0.981 vs 0.954 / 0.981;
  - RecalculateStyles 1.593 / 1.591 vs 1.555 / 1.570;
  - Layout 3.778 / 3.755 vs 3.798 / 3.747 (V mean +0.006).
  - Reported only: forced Layout is 2.563 / 2.504 in C and 2.272 / 2.200 in V. This answers the UNRESOLVED WebKit
    question: in WebKit, the nav hit test does force layouts (OBSERVED, in our setup).
- **Parity fails.**
  - *Audit (VA), 40 px per frame:* 1 mismatch in mobile, mobile-rtl and mobile-shift. In each, the cached answer was
    `false` and the real `F()` returned `true`, for one frame:
    - at y 3186 (mobile, mobile-rtl);
    - at y 3486 in mobile-shift, which is the same place moved by the inserted 300 px.
  - *Audit, 10 px per frame:* 0 mismatches in all cases. At 40 px in desktop and desktop-rtl: 0.
  - *States, C vs V:* 4 mismatches each in desktop and desktop-rtl.
    - On the way down, at y 1261 and 1334, V shows `is-scroll-hidden is-profile-sticky-hidden` and C does not.
    - On the way back up, at y 2425 and 2223, C shows those classes and V does not.
    - Mobile, mobile-rtl and mobile-shift have 0 state mismatches.
- **Next, per the card:** not landable.
  - Find the trigger that missed: the 40 px crossing near y 3186 on mobile, and the desktop hidden-state settle positions.
  - Then re-ticket and re-run all parts.
  - No retuning on this data.

## P-104 parity diagnosis (10-04, 18:20-18:40Z, exploratory; no V change judged on it)

Lead order (b), after v8 was decided. Debug-only probes in `out/nav-hit-cache/p104diag/` (gitignored), shared probe
slots, Chrome 154 headless, no CPU throttle. The A/A record is committed as `p104/diag-states-aa.json`.

**1. The mobile 40 px miss is a one-frame lag of the P-104 harness's own making, not a missed trigger.**
- The harness scrolls with `scrollTo` inside a rAF callback. That write lands after the frame's scroll event, but
  before the scroll engine's rAF callback, which was queued from that scroll event. So in every frame V's cached
  position (`__nsY`, taken in the scroll event) is one step behind the live `scrollY`.
- Logged per frame at the miss (mobile, scroll up, 40 px): `__nsY` 3186, live scrollY 3146, probe line 42 px.
  - V's cached line moved 3268 → 3228. The live line moved to 3188 and crossed the `.pain` top edge at 3194, so the
    real `F()` says dark.
  - V's ±12 px crossing window [3216, 3280] doesn't reach 3194, so V keeps "light" for that frame.
  - The next frame's window, [3176, 3240], holds the edge. V runs the real test there and agrees with C again.
- In that run all 21 logged frames around the miss lag by exactly one step (40 px). At 10 px the lag (10 px) is inside
  the ±12 px window, so P-104's 10 px audit saw 0 misses.
- Input doesn't do this: a touch, wheel or smooth scroll fires its scroll event before the frame's rAF callbacks. The
  page's only rAF-time `scrollTo` is the morph pin, and while the morph is active `C()` already forces the real test.
- Reading the live `scrollY` in the callback would close the gap, but it costs layout. Blink's
  `LocalDOMWindow::scrollY()` runs `document()->UpdateStyleAndLayout(DocumentUpdateReason::kJavaScript)`
  before it returns the offset (CONFIRMED: chromium/chromium main, `third_party/blink/renderer/core/frame/
  local_dom_window.cc`, `LocalDOMWindow::scrollY`, line 1877, fetched 10-04). That forced layout is exactly what this fix
  removes, so V keeps the scroll-event position.
- The successor card's audit now steps in two modes:
  - *task*: `scrollTo` in a task between frames, which orders events like input;
  - *raf*: P-104's mode.
  It also counts the lag frames, so a miss in a lag frame can be told apart from a missed trigger.

**2. The desktop state mismatches are the states harness, not V.**
- The harness jumps to a position, waits 3 rAFs and reads the nav's classes. The profile section's card has
  0.7-0.9 s transitions, so the one frame that the jump produces samples them at an arbitrary phase.
- A/A with P-104's own arms, 4 fresh desktop loads in the order C1 V1 C2 V2:
  - C1 vs C2: 5 mismatches, at y 1164, 1261, 1334, -2425, -2223 (negative = the way back up). These are P-104's
    positions plus 1164.
  - V1 vs V2: 1 mismatch.
  - C2 vs V2: 0 mismatches.
  - C1 vs V1: 4 mismatches.
- Between them, V's `__nsEE` and C's `ee()` do the same two rect reads inside the window, so the answer can only differ
  by frame phase. The successor audits that directly, frame by frame: `__nsEE(n)` against `ee()` in the same frame.
  It does the same for the hero pill (cached offsets against C's live rect formula). The states part is dropped.

**3. A real bug the parity runs could not see: the nav's own classes were never part of the signature.**
- Inside the scroll effect, `T` is the morph spring's step function. It is a local that shadows the component's bound
  nav element `T`.
- So `T && (a += T.className)` appended `"undefined"`, and the transition filter's `t === T` never matched the nav.
- The designed triggers (the nav's own scroll-hidden, pill and expanded classes, and its own geometry transitions)
  were dead code.
- The 10 px audits still found no frame where it changed the answer. Why is not known; the successor's audit covers
  it with the fix in place.
- Fixed in V on v8: a component-level `__navNode()` returns the nav. The fix adds a few real tests where the nav's
  classes change, and no reads in other frames.

**4. Rebased on v8.** `build.mjs` builds C from the baseline plus `fixes/v8-best/patch.diff` (3e3e94cb6e9f /
f836404b3728, checked against the pin). `patch-on-best.diff` applies to v8 unchanged with fuzz 0. `patch-on-v8.diff`
is that diff plus fix 3 above. `--base best` still rebuilds P-104's arms byte for byte.

**5. Smoke of the new audit on v8 (VA d7e96c5902a9, mobile only, 1 load, 10-04 18:44Z; harness check, not scored).**
Record: `p104/diag-audit-smoke-v8.json`.

| mode, step | frames | lag frames | theme / sticky / pill mismatches | of them in a frame without lag |
|---|---|---|---|---|
| task, 10 px | 1070 | 0 | 0 / 0 / 0 | 0 |
| task, 40 px | 268 | 0 | 0 / 0 / 0 | 0 |
| raf, 10 px | 1070 | 1069 | 0 / 0 / 2 | 0 |
| raf, 40 px | 268 | 267 | 1 / 0 / 2 | 0 |

- In raf mode, every mismatch falls in a lag frame. These are P-104's y 3186 miss, and the pill threshold near y 670,
  also one frame late.
- In task mode there is no lag and there are no mismatches.
- The run took 52 s, so all 5 cases fit in 2 shared probe slots.

## D card P-107

Successor to P-104. Ops pre-data read: PASS at 62e6d234 with notes N1-N4 (mgmt-ops-10), folded in below.

**Why.** P-104 failed on parity. The diagnosis above traces both failures to the harness. It also found and fixed a
real trigger bug (the nav's own classes), and the lead ordered the rebase onto v8. So the arms, the parity harness and
the base all change. Fresh loads only; nothing from P-104 counts.

**Question.** During a scripted scroll from top to bottom on v8, does V make Chrome do fewer pre-paint passes and fewer
nav hit-test reads per scroll frame than C, without more layout, style or paint work? Does it do no more work in the
Simulator? Does the nav state, frame by frame, equal what the original per-frame reads give in the same frame?

**Gate.** As P-104: the less-work landing rule. Judged counts are per 10 px stepper step, on the full page. No
smoothness claim.

**Arms**, checked as served. `node fixes/nav-hit-cache/build.mjs` rebuilds all three and prints these hashes. C is
built from the baseline plus `fixes/v8-best/patch.diff` and checked against v8's pin.

| arm | JS | CSS |
|---|---|---|
| C, v8 | 3e3e94cb6e9f | f836404b3728 |
| V, C + `patch-on-v8.diff` | fd3688901f50 | f836404b3728 |
| VA, V + debug audit hook (parity only) | d7e96c5902a9 | f836404b3728 |

**Harnesses** (sha256/12). Any change is listed here with its new hash before its data.

| file | hash |
|---|---|
| `build.mjs` | 17355c247e9c |
| `probe.mjs` | 8922642a627d |
| `simcount.mjs` | 58fc44c464a2 (unchanged) |
| `patch-on-v8.diff` | 7bbb6d4212ff |

- `probe.mjs count` and `simcount.mjs` are unchanged in what they count, except that the arms come from base v8.
- `probe.mjs parity` changed, as in the diagnosis:
  - the audit covers theme, sticky and pill, frame by frame;
  - it steps in task and raf modes;
  - it counts lag frames;
  - the states part is dropped.

**Loads and order.** As P-104: 2 fresh loads per arm and viewport, in the order C1 V1 V2 C2.
- Chrome counts: `count --vp mobile`, then `count --vp desktop`. One shared probe hold each, at most 300 s.
- Parity: `--cases mobile,desktop`, then `--cases desktop-rtl,mobile-rtl,mobile-shift`. One shared probe hold each.
- Simulator: one simulator hold, `C:1 V:1 V:2 C:2`.
- Raw output goes to `out/nav-hit-cache/p107/` (each run gets `--out out/nav-hit-cache/p107/<part>.json`). The JSON
  records are committed to `fixes/nav-hit-cache/p107/` after scoring.

**VOID.** As P-104. The served hashes must equal the arm table above.

**Counts and verdicts.**
- *Judged, Chrome.* Each must be lower in both viewports, with every V load below every C load:
  - PrePaint per step (total);
  - forced PrePaint per step;
  - nav `elementsFromPoint` per step;
  - nav `getComputedStyle` per step.
- *Guards, Chrome.* Each must be no worse in each viewport, V mean ≤ C mean + 0.05 per step:
  - forced Layout;
  - Layout;
  - UpdateLayoutTree;
  - Paint.
- *Simulator.* No worse, V mean ≤ C mean + 0.05: RecalculateStyles, Layout, RenderingFrame. Forced Layout is reported
  only.
- *Parity.* Must hold in all 5 cases:
  - task mode, 10 px and 40 px: lag frames = 0, and theme, sticky and pill mismatches = 0;
  - raf mode, 10 px and 40 px: no mismatch in a frame without lag. Mismatches in lag frames are reported with their y;
    they are the harness's one-frame lag (diagnosis 1).
  - no new page errors.
- *N1: task mode is the real parity gate; raf mode is report-only in effect.* In the smoke, 1069 of 1070 raf frames
  lag, so the exemption would excuse nearly every raf mismatch. Raf mode stays in for its lag count and the y of each
  mismatch, but a pass rests on task mode. The exemption ("no input or page script produces that lag") rests on two
  things:
  - (a) *Scroll-write inventory* of v8's page JS (`2.DyWL8TcE.js`, v8 line numbers, checked by mgmt-ops-10):
    - `window.scrollTo` smooth at l.4713 and l.11624;
    - the horizontal carousel `scrollTo` at l.11598 and l.11606 (not the window);
    - the morph pin `L` at l.14006, which runs only while `C()` is true, and `C()` forces the real test;
    - the debug `__fwMorphDrive` at l.14033, stripped before landing.
    No other rAF-time write to the window's scroll position exists.
  - (b) *Event loop order:* in "update the rendering", the scroll steps (which fire `scroll` events) run before the
    animation frame callbacks. CONFIRMED: HTML Living Standard, event loops, processing model, "update the rendering"
    (run the scroll steps, then run the animation frame callbacks). So a scroll from input or from a task is seen by
    the passive listener before `iE` runs in the same frame.
- *N2: a task-mode lag frame is a harness fault, not a V fault.* Task mode should show none. If any appears, that case
  is VOID: re-run it once in a fresh load. If it lags again, report it as a harness fault and stop, with no parity
  verdict for that case. A task-mode mismatch in a frame without lag still fails parity.
- *N3: audit channel for every answer V caches.* V caches the scroll position (`__nsY`, from the passive listener),
  the viewport height (`__nsVh`) and the geometry in `__nsGeo` (probe line, edges, zones, track). These feed three
  answers, and each has a channel compared in the same frame:

  | answer V writes | V's input | audited against |
  |---|---|---|
  | theme (`g`) | last real `F()` (`__nsG`), kept until a trigger | `F()` |
  | sticky (`v`) | `__nsEE(__nsY)` | `ee()` |
  | pill (`p`) | `__nsY` vs cached `__nsGeo.track` | C's live `.hero-track` rect formula |

  Nothing else is cached. The nav's `is-scroll-hidden` class (the one P-104's desktop states showed) is
  `s(v) && !s(E)`: `v` is the sticky channel above, and `E = R(() => s(x) > 0.001)` comes from the morph spring
  value `x`, which V does not touch (overlay l.13820, 13826, 14412). `is-morphing` is `E` alone.
- *N4: the prediction intervals come from P-104's data,* so hits here are a replication of P-104, not an independent
  prediction. This is the same as P-104 itself.

**Predictions** (per 10 px step). v8 differs from best, and the nav-class fix adds a few real tests. So the V intervals
are P-104's V values ± 0.06, and the C intervals are P-104's C values ± 0.06:

| count | mobile C | mobile V | desktop C | desktop V |
|---|---|---|---|---|
| PrePaint, total | 2.16 to 2.28 | 1.81 to 1.94 | 1.76 to 1.90 | 1.63 to 1.75 |
| PrePaint, forced | 0.94 to 1.06 | 0.58 to 0.70 | 0.60 to 0.73 | 0.45 to 0.57 |
| nav `elementsFromPoint` | 0.94 to 1.06 | 0.58 to 0.70 | 0.94 to 1.06 | 0.61 to 0.73 |
| nav `getComputedStyle` | 0.94 to 1.06 | 0 to 0.02 | 0.94 to 1.06 | 0 to 0.02 |
| guards | as measured | within ±0.05 of C | as measured | within ±0.05 of C |

- Simulator: V within ±0.05 of C on the three no-worse counts.
- Parity: as the rule above, in all 5 cases.

**What happens next, whatever the result.**
- *Pass:* the short phone no-worse check, on its own ops ticket. The lead's order holds: no iPhone until P-105 and
  PR-018 rev 7 are done. Then a land request.
- *Parity fails* (a task-mode mismatch, or a raf mismatch in a frame without lag; a task-mode lag frame voids its
  case instead, N2): not landable. Fix it, re-ticket and
  re-run all parts.
- *A guard or the Simulator worse,* or *a judged count not lower:* report it as measured and re-ticket. No retuning on
  this card's data.

## P-107 result: PASS on every part (10-04, 18:55-19:51Z; records in `p107/`)

The arms were served as pinned in every load. The probe throws if a served hash differs, and the count and Simulator
records list the hashes. No page errors in any load. Harness hashes are as on the card. Order C1 V1 V2 C2.

**Chrome counts** (per 10 px step; mean of 2 loads; every V load below every C load; all values inside the predicted
intervals). Scored by `p107/score-chrome.mjs` → `p107/score-chrome.json`.

| count | mobile C | mobile V | desktop C | desktop V |
|---|---|---|---|---|
| PrePaint, total | 2.227 | 1.861 | 1.848 | 1.699 |
| PrePaint, forced | 0.998 | 0.641 | 0.664 | 0.516 |
| nav `elementsFromPoint` | 0.998 | 0.641 | 0.999 | 0.672 |
| nav `getComputedStyle` | 0.998 | 0 | 0.999 | 0.001 |
| guard: forced Layout | 0.379 | 0.377 | 0.345 | 0.343 |
| guard: Layout | 0.450 | 0.448 | 0.391 | 0.389 |
| guard: UpdateLayoutTree | 1.271 | 1.270 | 1.528 | 1.525 |
| guard: Paint | 3.676 | 3.622 | 2.516 | 2.514 |

Every judged count is lower in both viewports, and every guard is no worse (V ≤ C + 0.05).

**Parity** (VA d7e96c5902a9; `p107/parity-1.json`: mobile, desktop; `p107/parity-2.json`: desktop-rtl, mobile-rtl,
mobile-shift). Mismatches are listed as theme / sticky / pill.

| case | task 10 / 40 px: lag, mismatches | raf 10 px: lag frames, mismatches | raf 40 px: lag frames, mismatches |
|---|---|---|---|
| mobile | 0, 0/0/0 · 0, 0/0/0 | 1069 of 1070, 0/0/2 | 267 of 268, 1/0/2 |
| desktop | 0, 0/0/0 · 0, 0/0/0 | 1689 of 1690, 0/0/2 | 423 of 424, 0/0/2 |
| desktop-rtl | 0, 0/0/0 · 0, 0/0/0 | 1689 of 1690, 0/0/2 | 423 of 424, 0/0/2 |
| mobile-rtl | 0, 0/0/0 · 0, 0/0/0 | 1069 of 1070, 0/0/2 | 267 of 268, 1/0/2 |
| mobile-shift | 0, 0/0/0 · 0, 0/0/0 | 1129 of 1130, 0/0/2 | 283 of 284, 1/0/2 |

- Task mode (the gate, N1): no lag frame and no mismatch in any of the 5 cases, at both steps. No case was voided (N2).
- Raf mode (report only): every mismatch is in a lag frame. They are the pill threshold near y 640-680 (one frame
  late each way) and the theme edge at y 3186 (3486 with the 300 px shift). These are the same places as the smoke
  and P-104.

**Simulator** (`p107/simcount.json`, per step, mean of 2 loads): no worse on all three counts.

| count | C | V | rule V ≤ C + 0.05 |
|---|---|---|---|
| RecalculateStyles | 1.353 | 1.346 | holds |
| Layout | 3.724 | 3.715 | holds |
| RenderingFrame | 0.938 | 0.931 | holds |
| forced Layout (report only) | 2.519 | 2.261 | |

- The Simulator ran beside a busy Mac: sim background mean 73 %, load1 max 116 (I-082). These are counts, so they
  carry that context, but C and V ran in the same session in the C V V C order.

**Next, per the card.** *Pass:* the short phone no-worse check on its own ops ticket. That waits for the lead's order
(no iPhone until P-105 and PR-018 rev 7 are done). Before a land request, two more checks are owed: the combined VA
audit with fix-scroll-cb's patch, and `__nsForce = !0` in any combined build with PR-018.

## P-117 owed checks on the combined build (10-04, 20:41Z on; records in `p117/`)

The lead's order (P-117 N1 ruling): the parity audit on the exact combined V that int-v8 built, a Simulator momentum
case, each load's served hash in the records, and the PR-018 note.

**Build** (`build.mjs --base v8sc`):

| arm | what | JS / CSS |
|---|---|---|
| C | v8 + scroll-cb-on-v8.diff (int-v8 833fb29e, file 3abcd7008e61) | 4c48e372ecdd / f836404b3728 |
| V | C + patch-on-v8.diff (7bbb6d4212ff) = int-v8's combined V | e8d8323f674b / f836404b3728 |
| VA | V + the audit hook (HOOK_V8, DEBUG ONLY) | eb2089b858ab / f836404b3728 |

- V matches int-v8's pin, so nav-hit-cache applies to v8 + scroll-cb with exact context (`patch -F 0`), as int-v8
  found (nav and scroll-cb commute).
- The scroll-cb diff is read from commit 833fb29e with `git show` and checked against its hash
  (`out/nav-hit-cache/from/`).
- scroll-cb touches only the commission, future and platform sections (lines 3216-3354, 11537-12239 and 13308-13332 of
  v8). The nav effect (13846-14063) is outside every hunk, so the audit hook's anchor is unchanged.
- Harness: `probe.mjs` now writes each parity load's served hashes (`audit.<case>.served`), which closes ops' N1.

**Parity** (`probe.mjs parity --base v8sc`, Chrome, shared probe slots):

PASS: task mode (the gate) has 0 lag frames and 0 mismatches in all 5 cases, at 10 and 40 px per step.

| case | task: lag / theme / sticky / pill | raf: mismatches (all in lag frames) | served JS / CSS |
|---|---|---|---|
| mobile | 0 / 0 / 0 / 0 | pill 2+2, theme 0+1 | eb2089b858ab / f836404b3728 |
| desktop | 0 / 0 / 0 / 0 | pill 2+2 | eb2089b858ab / f836404b3728 |
| desktop-rtl | 0 / 0 / 0 / 0 | pill 2+2 | eb2089b858ab / f836404b3728 |
| mobile-rtl | 0 / 0 / 0 / 0 | pill 2+2, theme 0+1 | eb2089b858ab / f836404b3728 |
| mobile-shift | 0 / 0 / 0 / 0 | pill 2+2, theme 0+1 | eb2089b858ab / f836404b3728 |

- Steps per case: mobile 1070 + 268, desktop 1690 + 424, mobile-shift 1130 + 284 (10 px + 40 px, down and up).
- Raf mode (report only, F-239): every frame lags one step, as before, and no mismatch is in sync (inSync 0). The
  raf counts equal P-107's on v8 alone, so scroll-cb changes nothing the nav reads.
- Records: `p117/parity-1.json` (mobile, desktop, 20:41Z) and `p117/parity-2.json` (rtl and shift cases, 20:45Z),
  each with `audit.<case>.served`; page errors none.

**Simulator momentum case** (`momentum-sim.mjs`, gesture `gestures/momentum-flick-v1.json`, logger
`momentum-inject.mjs`):

Run: VA of v8sc (eb2089b858ab / f836404b3728, checked on every load), 2 loads, Simulator (iPhone 15 Pro Max, iOS 18.7
runtime), normal exclusive hold 21:45:49-21:50:47Z (`sim.mjs gesture` refuses a no-timing hold, I-184). WDA flings run
down to the end and back to the top, and each glide is left to settle. Counts only, no ms (F-084). Record:
`p117/sim-momentum.json`.

| load | frames moved (touch + glide) | moved with no scroll event: touch / glide | audit: tested / cached | lag frames | theme / sticky / pill mismatches |
|---|---|---|---|---|---|
| 1 | 543 (44 + 499) | 2 / 42 | 319 / 185 | 1 | 0 / 0 / 0 |
| 2 | 601 (49 + 552) | 3 / 34 | 465 / 103 | 1 | 0 / 0 / 0 |

- **Scroll events during momentum: not every frame (OBSERVED in the Simulator, cause unknown).** In 7-8 % of the glide
  frames where the page moved, WebKit fired no scroll event; at most one event per frame. This settles the P-117 N1
  question locally, for the Simulator only. No reference was checked; the real phone was not tested (no iPhone for this
  topic).
- **The cache follows anyway.** The nav frame is scheduled from the scroll event, in the original and in V alike. In a
  frame with no event, neither one runs, so neither updates. Per load, `__nsY` differed from the live scrollY in 1 nav
  frame. Even there, V's answers equalled the original's own reads (`inSync` 0 / 0 / 0, no mismatch at all).
- **The same load, WebKit scripted audit** (probe.mjs's 10 px scroll, top -> bottom -> top, load 1):

  | driver | steps | tested / cached | lag frames | theme / sticky / pill mismatches |
  |---|---|---|---|---|
  | task (the gate) | 1051 | 638 / 439 | 0 | 0 / 0 / 0 |
  | raf (report only, F-239) | 1052 | 616 / 437 | 1050 | 1 / 0 / 2, all in lag frames (inSync 0) |

  The WebKit result matches Chrome's: task mode 0 / 0, and raf mode differs only by the harness's one-frame lag.

**PR-018 (rev 7c, accepted).** Rev 7c's `delta.diff` (branch fix/morph-scroll 75466887, line 155) runs the nav's
backdrop test again in a microtask: `e <= 0.2 && queueMicrotask(() => z(g, F(), !0))`. With nav-hit-cache, the nav
frame writes the cached answer every frame (`z(g, __nsG, !0)`), so one frame later it would undo that microtask. Any
build that has both must use:

```js
e <= 0.2 && queueMicrotask(() => (z(g, (__nsG = F()), !0), (__nsForce = !0)))
```

- `__nsG = F()` keeps the cache equal to the fresh answer.
- `__nsForce = !0` makes the next nav frame run the real test again and re-read the probe line.
- Both names are `let`s of the same scroll effect (`ne(() => { … })`, lines 13881-14227 of the overlay) as rev 7c's
  `__osb` / `__navMorphSet` code, so they are in scope.
- The two patches overlap textually (rev 7c hunks @@ -14015 and @@ -14054 against nav @@ -14014 and @@ -14057), so the
  combined build needs a carry like int-v8's. The combiner does it; the line above is the only semantic change it
  needs.
- The combined build gets the same VA audit, with an extra case that runs into rev 7c's extra end screen and back
  to p = 0, before it lands.

## v9 package: nav on top of PR-018 rev 7c, plus the glue (10-04, for int-v8)

int-v8 chose option (a). The nav delta enters v9 unchanged, and a separate glue component is applied last, only when
both nav-hit-cache and rev 7c are in.

| file | what | sha256 (12) |
|---|---|---|
| `patch-on-v8.diff` | the nav delta on v8, 3 context lines (U3) | 7bbb6d4212ff |
| `patch-on-v8-u1.diff` | the same change with 1 context line (U1), for strict apply on top of 7c | 7b5f3947b465 |
| `glue-ms7c.diff` | rev 7c's microtask line -> `(z(g, (__nsG = F()), !0), (__nsForce = !0))`, one hunk | 5d63660a9e62 |
| `patch-on-v8ms.diff` | v8 + 7c -> nav + glue in one diff (build.mjs base `v8ms`) | af661eba2c7c |

Strict apply (`patch -F 0`; every build below passes `node --check`):

| base | + | result JS / CSS |
|---|---|---|
| v8 (3e3e94cb6e9f) | U3 or U1 | fd3688901f50 / f836404b3728 (nhc8) |
| v8 + 7c (v8ms 428961bda278 / 659b02f7169d) | U3 | **fails**: U3's trailing context overlaps the "morph-scroll setup" lines that 7c inserts |
| v8 + 7c | U1, then glue | 9138732704f2 / 659b02f7169d (nhcms) = `patch-on-v8ms.diff` |
| v9 step 3 (7c + double-drive + scroll-cb, 25dc3025f1a0 / 40037dc99f11) | U1, then glue | c211d557e357 / 40037dc99f11 |

- **Order:** 7c, then nav (U1), then glue. 7c's own delta does not apply strictly on top of nav, so nav cannot go in
  first.
- **Parity on nhcms (9138732704f2, VA f325bf009cd6):** `probe.mjs parity --base v8ms`, all 5 cases. The records go in
  `v9prep/parity-{1,2}.json`; result pending.

## Flicker triage (fix-scroll-cb's task-driver check, 26777ce0)

Pending: a C (v8) vs N (v8 + nav-hit-cache) Simulator check, `flicker-sim.mjs`, 12 loads in ABBA order.

## Smoke (not scored)

C only, mobile, 1 load (`probe.mjs` 506d1f0397d7, `--arms C --reps 1 --vp mobile`, 10-04 10:37Z, shared probe slot).
It was run only to check the harness, and it is not part of P-101's loads.
- 535 steps.
- Per step: PrePaint 2.23 (forced 1.00); UpdateLayoutTree 1.36 (forced 1.28); Layout 0.45 (forced 0.38).
- Nav calls per step: elementsFromPoint 1.00, getComputedStyle 1.00, rects 2.00.
- No page errors.
- The harness counts what the card names.
- The C forced-Layout interval in the card (0.9 to 2.5) looks too high. It stays as registered: no retuning.

## Risks, conflicts, follow-ups

- **A trigger the cache does not see.** For example, a child class flip that moves geometry instantly, with no
  transition and no class change on a theme section. The audit is the check, and it covers both scroll directions and
  two speeds. Reduced motion and touch flings are not in the audit (scripted scroll only).
- **fix-scroll-cb (scroll callbacks off on phones).** If they stop registering the commission / future / platform
  callbacks on phones, the `shrinking` / `entering` / `is-visible` classes may stop flipping there. This fix reads those
  classes as triggers. The audit must be re-run on their build before both land together (agreed: they tell me first).
- **T-107, the Join waitlist GPU variant (same owner).** It changes the header's earn-button rules, not the hit test.
  If it lands on the best build before this fix does, V is rebuilt on the new best, and P-104's arms no longer match:
  re-ticket.
- **Optional later.** Share the hero-track progress ≥ 0.72 value with fix-scroll-cb (their suggestion), so that one
  reader computes it.
- **History.** N12 v5's history and its probe stay in `fixes/nav-scroll-handler/` (brought over from the work branch,
  absolute paths scrubbed). v5 is superseded by this fix.
