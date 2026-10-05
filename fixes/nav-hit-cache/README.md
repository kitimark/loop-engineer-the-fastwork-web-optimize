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
| `patch-on-v8-u1.diff` | the same change with 1 context line (U1), for strict apply on top of 7c | 7b5f3947b465; since 10-05 929268181c61 (the re-measure fix, see "Parity on v9 step 4") |
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
  `v9prep/parity-{1,2}.json` (22:28Z and 23:01Z, shared probe slots). **PASS:** in all 5 cases, task mode at 10 and
  40 px has 0 lag frames and 0 theme / sticky / pill mismatches. Raf mode (report only) has pill 2 per run, all in lag
  frames (inSync 0), and theme 0. Every load served f325bf009cd6 / 659b02f7169d; no page errors. The mobile cases now
  take 1256 / 1316 steps (1070 / 1130 on v8), because rev 7c makes the page longer and the scroll covers its end screen both ways. That is the extra case the
  PR-018 note above asks for, and it covers the glue.

## Flicker triage (fix-scroll-cb's task-driver check, 26777ce0)

fix-scroll-cb's task-driver Simulator check saw two one-step flickers, and only in builds with nav-hit-cache:
`.pain` is-pain-dark went off, on, off at steps 964-966 (N1, N2, V1), and the nav's is-on-dark went on, off, on at
412-414 (V2).

**Verdict: neither flicker comes from nav-hit-cache.** Both come from the scroll position the page sees stepping
back by one step, which also happens in v8 alone. OBSERVED in our setup; why WebKit's scroll position steps back
under a one-way driver is unknown.

**Check.** `flicker-sim.mjs`: C = v8 (3e3e94cb6e9f) against N = v8 + nav-hit-cache (fd3688901f50, the same N as
fix-scroll-cb's), both CSS f836404b3728. Served hashes were checked on every load. Simulator, functional shared
slots at 22:29Z and 23:05Z, the task driver. A MutationObserver logs every `.pain` and nav class change with the live
scrollY, the `.pain` document offset, scrollHeight and the section geometry. Two slots ran out at 300 s (exit 124),
so 7 loads finished of the 12 planned. Records: `p117/flicker-{1,2}.json`.

| load | .pain flicker | nav flicker | live scrollY at the flicker's three flips |
|---|---|---|---|
| C1 | - | steps 215-217 | 2150, 2140, 2170 |
| N1 | - | - | |
| N2 | - | - | |
| N4 | steps 89-91 (way down) | - | 890, 880, 900 |
| C4 | - | steps 760-762 | 2910, 2920, 2910 |
| C5 | - | - | |
| N5 | - | - | |

- **The same flicker shows in v8 alone.** Here the nav flicker came up in 2 of 3 C loads and 0 of 4 N loads.
  fix-scroll-cb saw it in 1 of 2 V loads and 0 of 2 C loads.
- **What drives every flicker.** In all three, the live scrollY moved back by one step although the driver only
  moves one way. The class then followed the scroll position back: the page's rules answered correctly for the
  position they saw.
- **The patch moves no layout.** `.pain`'s document offset (1407.72) and scrollHeight (6035) are identical at
  every flip of every load, C and N alike.
- **The patch never writes `.pain`.** Its class comes from the v8 future job (line 12172, `rect.top <= 0.5`), which
  nav-hit-cache does not touch.
- **The nav flip lands where the cached answer comes from.** Every theme value the cache writes is either F() from
  that frame or the last F() result. A carried value can only delay a change; it cannot make a new one. So an
  on/off/on flip is F() itself answering for the position it saw.
- **The WebKit per-frame audit agrees.** On V (Simulator, task driver) it found 0 theme / sticky / pill
  mismatches; see the momentum section above.
- **Counts.** Pooled with fix-scroll-cb's loads, the `.pain` flicker appeared in 4 of 9 nav-hit-cache loads and
  0 of 5 v8 loads. Fisher's exact test gives p = 0.13, so the split is not significant. The mechanism above (a
  backward scroll step) also shows in C.
- **Rule for later parity.** A one-step flicker at a threshold is driver jitter, as P-108's v8-vs-v8 diffs already
  showed (20 of them). Judge single steps only together with the live scrollY at the flip.
- **Status after the lead's ruling (10-05).** The driver-jitter mechanism stays OBSERVED: 4/9 vs 0/5 is not
  significant, and it is no evidence of no harm either. mgmt-ops-10's second read AGREES (953328a0), with two notes:
  - backward steps were logged only at flips, so nobody counted them per arm;
  - this parity ran without scroll-cb.
  nav-hit-cache + glue go to the v9-final candidate, admitted by the phone flicker gate below. P-117 is superseded.

## Flicker gate for the v9-final ticket (draft for int-v8, 10-05; fixed before any data)

The ticket is v9-final (with nav + glue) against v9 step 4, on the phone, with the G driver. This gate rides on the
same counted runs: every G run adds `--inject fixes/nav-hit-cache/flicker-inject.mjs`. COUNTS ONLY, no timing claim.

- **Logger** (`flicker-inject.mjs`). A MutationObserver on the class of `.pain` and of `.start-selling-top-nav`. It
  logs each flip of is-pain-dark / is-on-dark as `[t, kind, on]`, with t = performance.now(), the gesture recorder's
  clock.
  - It reads no layout and no scrollY. Position comes from the recorder's own per-frame scrollY.
  - It records only real changes. Both arms carry the same logger.
  - It re-installs on every page load.
  - Checked only on a fake DOM and by the class writers in v9 step 3 (12302 `.pain` toggle, 14774 nav `is-on-dark`).
    It never ran on the phone.
- **Metric** (`flicker-gate.mjs`, per kind, summed over each arm's counted runs).
  - *Blink:* two consecutive flips of one kind whose middle state lasted ≤ K rendered frames. K = 8; twins K = 4 and
    16.
  - *Monotone blink:* a blink across which the recorder's scrollY never changed direction, from two frames before the
    first flip to the second flip.
  - *Turn blink:* any other blink. In a turn blink the class followed the scroll position back, which is the
    Simulator mechanism.
- **Gate.**

  | | test | threshold |
  |---|---|---|
  | G1 (hard) | V monotone blinks | = 0 |
  | G2 (no-worse) | V blinks | ≤ C blinks + 1 |
  | G3 (no-worse) | median flips per run, each kind | V ≤ C + 2 |

  - **Valid run:** an inject value for every segment, both elements found, no inject error.
  - **VOID:** fewer than 3 valid runs in an arm, or arms that ran different gesture script hashes.
  - **Threshold-sensitive:** the K = 8 verdict differs from either twin.
  - **Exit codes:** 0 PASS, 3 FAIL, 4 VOID, 5 INCONCLUSIVE.
- **Backward steps (lead ruling A, from ops note A).**
  - The scorer reads scrollY at every rendered frame (the gesture recorder's frames), not only at flips.
  - Per run it counts the direction changes and the one-frame step-backs. Per arm it reports the median step-back
    rate per 1000 moving frames.
  - A blink count (G2) goes against V only when the two arms' rates match: within a factor 1.5 of each other, or both
    ≤ 0.5.
  - G2 failing with rates that differ is INCONCLUSIVE, not PASS.
  - G1 (monotone blinks) needs no step-back, so it stands either way.
- **Prediction (before data).**
  - G1: 0 in both arms. A carried cache value can only delay a change, not make one.
  - G2: V blinks = C blinks ± 1.
  - G3: equal medians ± 1.
  - A G1 FAIL, or a G1 count above 0 in C, falsifies the mechanism and sends the flicker back to triage.
- **Self-check.** Synthetic records, in scratch only:
  - a clean block → PASS;
  - a step-back blink in both arms → PASS (turn blinks);
  - step-back blinks in V only, step-back rates differ → INCONCLUSIVE;
  - one monotone blink in V → G1 FAIL;
  - a run with the nav element missing → VOID run.

```sh
node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner <runner> --label <arm>-<pos> \
  --inject fixes/nav-hit-cache/flicker-inject.mjs
node fixes/nav-hit-cache/flicker-gate.mjs --arm C <C runs...> --arm V <V runs...> [--json gate.json]
```

## Parity on v9 step 4 + nav + glue (lead ruling B, 10-05; records in `v9final/`)

The ruling: re-run the task-mode parity audit on v9 step 4 (de237379b556 / e1359ab9994a) + U1 + glue before
nav-hit-cache enters v9-final. `probe.mjs parity --base v9s4`, shared probe slots, Chrome 154, no CPU throttle.

**First run: FAIL** (`v9final/parity-1-pre.json`, VA e6323dbf83d3, 23:24Z). Task10 was clean in both viewports. Task40
had 1 in-sync theme mismatch per viewport, on the way down:

| case | step | V | real hit test |
|---|---|---|---|
| mobile | y 2240 | not dark | dark |
| desktop | y 4960 | not dark | dark |

**Diagnosis** (`probe.mjs diag`, `v9final/diag-1.json`). The probe replays the audit and logs the hit chain under the
probe line, the fresh edges, the classes and the running animations around those steps.
- Both mismatches are the first step whose probe line lies past the future card's bottom: 2262 on mobile (line
  2282), 4985 on desktop (line 5008). There the hit moves from the card to `.pain-sticky`, which is dark.
- The next step tests again and is correct, so each viewport has exactly one mismatch.
- **Cause:** the cache measured the card's bottom edge while the card still sat at its reveal transform,
  `translateY(48px)` (`.start-selling-future:not(.is-visible)`). So the cached edge was 48 px low, about 2310 / 5033.
  - When `is-visible` arrived, the 0.9 s transform transition kept the real test running, and its `transitionend`
    added one tail frame. Nothing re-measured the edges.
  - The 40 px step 2242 -> 2282 (crossing window 2230-2294) therefore missed the stale edge. The 10 px steps stayed
    inside the moving zone's ±12 px margin, which hid the miss.
- **Why only now:** before double-drive, `.is-visible.is-future-shrinking` restarted the card's 0.9 s transform
  transition every frame. That kept the real test on through the whole shrink. Double-drive (T-157) removed that
  transition (`transition-property: opacity, filter`), so the cache now relied on the stale edge. nhcms has no
  double-drive and stayed clean.
- **Fix (U1):** when a theme-section target's last tracked geometry transition ends, the edges are re-measured
  (`__nsGeo = null`; the next frame measures, on the layout F() forces in that frame anyway). The nav's own
  transitions don't re-measure: they move no section edge, and the probe line is re-read after every test.
  - The change is one line plus a 3-line comment rewrite, so the hunk line counts are unchanged.
  - It is in both `patch-on-v8-u1.diff` (929268181c61) and `patch-on-v9s4.diff` (9814fdad848e).
  - U1, then `glue-ms7c.diff` (5d63660a9e62, unchanged), applied strictly onto step 4 gives exactly V.

**Re-run: PASS** (`v9final/parity-1.json` 23:56Z, `v9final/parity-2.json` 00:05Z). V c3d36476c3ce, VA 33bf2744db57,
CSS e1359ab9994a; every load served VA's pin; no page errors.

| case | task10 | task40 | raf10 (report only) | raf40 (report only) |
|---|---|---|---|---|
| mobile | 0 lag, 0 / 0 / 0 | 0 lag, 0 / 0 / 0 | pill 2 (0 in sync) | theme 1, pill 2 (0 in sync) |
| desktop | same | same | same | same |
| desktop-rtl | same | same | same | same |
| mobile-rtl | same | same | same | same |
| mobile-shift | same | same | same | same |

- The task columns read lag frames, then theme / sticky / pill mismatches.
- The raf40 theme entry is the same card-bottom crossing, met on the way up in a lag frame. The cache answered for its
  scroll-event position (2238, line past the edge, dark). The audit's F() saw the live scrollY one step earlier (2198,
  not dark). It is the harness lag, not a cache miss: in sync 0.
- **Touch input:** the parity drive moves the page only by `scrollTo` (tasks or rAF). The mobile cases emulate touch,
  but no touch event ever fires, so no fling from the page end. A morph-scroll change limited to touchend (rev 7d)
  does not change what this audit runs.
- **Carry-over to the rev 7d rebuild of v9 (lead, 10-05).** This PASS holds for v9 rebuilt with morph-scroll rev 7d +
  U1 (929268181c61) + glue (5d63660a9e62), with no re-run, given a byte-diff note: the rebuilt V may differ from
  c3d36476c3ce only in rev 7d's morph-scroll touchend lines. Any other differing line voids the carry-over: re-run
  `probe.mjs parity` on the new base.

## Parity on v9-final + rev 7d, the v9.1 base (10-05; record `v9final/parity-v91-1.json`)

PR-023 chose menu rev 7d (rev 5, accepted 10:15:50Z), so v9.1 stacks on v9-final + 7d (fix-hero-exit-threaded ada7f461,
`fixes/morph-scroll-v9try/patch.diff` 6d1632eb0ee9, JS 1b2eecc66011). The carry-over above did not apply. v9-final as
landed (8b5ce9b3, 647c9ef2b1e2) dropped scroll-cb and the close rule, so its bytes differ from the PASS build
c3d36476c3ce by scroll-cb's lines (201 diff lines), not only by 7d's touch lines. That meant a re-run.

**Bytes (build.mjs bases `v9f`, `v9f7d`).** For each build, C = the build minus nav, by reverse strict apply of
`patch-on-v9s4.diff` (9814fdad848e). Applying that diff again gives the build back exactly.

| base | build (V) | C = V minus nav | VA |
|---|---|---|---|
| v9f (v9-final) | 647c9ef2b1e2 | 366636504b84 (int-v8's pinned "step 4 minus scb" join) | 48552ea6cfba |
| v9f7d (v9-final + 7d) | 1b2eecc66011 | a707f659f650 | de8c7fc68c56 |

The CSS is e1359ab9994a throughout. diff(647c9ef2b1e2 to 1b2eecc66011) is only rev 7d's 5 touch-path hunks: comment,
`__msF0` declaration, the lift-off rule, touchstart's `__msF0`, and the inert `__msDbg` log. The parity drive fires no
touch events, so the v9f7d run covers v9-final as shipped too.

**PASS** (10:37Z, shared probe slot, 140 s, served VA's pin, no page errors):

| case | task10 | task40 | raf10 (report only) | raf40 (report only) |
|---|---|---|---|---|
| mobile | 0 lag, 0 / 0 / 0 | 0 lag, 0 / 0 / 0 | pill 2 (0 in sync) | theme 1, pill 1 (0 in sync) |
| desktop | same | same | pill 2 (0 in sync) | theme 1, pill 2 (0 in sync) |

The raf entries are the same harness-lag frames as on step 4: the mobile theme entry is again [2238, dark, not, 2198],
and the desktop one is [4968, …, 4928], the future card's bottom edge. Part 2 (desktop-rtl, mobile-rtl, mobile-shift) was not
re-run on this base. It passed on step 4 and runs on request (one more ~140 s slot).

## D card P-136: U2, the morph-open hit-test deferral (rev 1, registered before its data)

**SIGNED by the lead** (10-05, after ops' pre-data read PASS ccf67f0c on 6d8d400c), with ops' notes N1-N4 as conditions:
- N1: C2's reference and C1's threshold 40 and p values are informed by parity run 2's deferred count (pre-card
  evidence); the result read labels them so.
- N2: the Chrome tolerances rest on one A/A pair per viewport; the Simulator tolerance comes from its own K-K A/A.
- N3: part 2 follows the lead's phone order (after P-130's H4 / H5 on phone back, alongside P-137 and P-134, first
  signed first; runner iphone-runner); Simulator slots are DEFERRED during phone blocks.
- N4: if P-134 lands first, ops delta-checks the re-pinned K / V before any counted run.

Part 1 runs now in the shared lane; part 2 waits for the phone. The card text below is unchanged from 6d8d400c.

Less-work card (memory "less-work-landing-rule"): cost-card counts per event on the full page in Chrome and the
Simulator, plus one short phone no-worse check. No smoothness claim. Id P-136 from mgmt-ops-10; the lead accepted U2 in
principle as exact less work (the shown `is-on-dark` value is unchanged) and keeps it out of int-v8's P-134 (v9.1 =
scroll-cb + g11 on 7d). Origin: finding F-278 (acked).

**What U2 changes.** On touch phones (`__msEnd` exists only there), while the morph is open (`C()`), the nav theme hit
test in `_()` runs before `__msTick` writes the new morph value, so its answer is never the one that shows:
- at m <= 0.2, `__msTick` tests again after its write (two tests per frame on K, the second one shows);
- above 0.2, `is-on-dark` is `g || m > 0.2`, dark whatever `g` is.

U2 skips the test in `_()` in those frames (`__nsMsPend`, and `__nsForce` so the first frame after the morph closes
tests), and `__msTick` queues its microtask test when the value changed or a test was deferred, keyed on `r` (the value
`x` holds). Result: 1 test per frame at m <= 0.2 and 0 above, instead of 2 and 1. Desktop, reduced motion and wide
screens never take the branch. Delta (3 sites, 38 lines): `u2-delta-on-v9f7d.diff`.

**Arms**, checked as served (sha256/12; CSS e1359ab9994a in every arm).

| arm | JS | built how |
|---|---|---|
| K (control) = C here: v9-final + rev 7d, main 189ca7ed | 1b2eecc66011 | `build.mjs --base v9f7d`: v9f7d's C a707f659f650 (v9-final + 7d minus nav, reverse strict apply) + `patch-on-v9s4.diff` 9814fdad848e. The same bytes as main's: v9-final 647c9ef2b1e2 + `fixes/morph-scroll-v9try/patch.diff` 6d1632eb0ee9 (ada7f461, landed 189ca7ed) |
| V = K + U2 | c7435c24dc56 | `build.mjs --base v9f7du2`: a707f659f650 + `patch-on-v9f7d-u2.diff` dfd77e2172ef (nav + glue + U2 in one); equals K + `u2-delta-on-v9f7d.diff` c0d040afe271 |
| VA = V + debug audit hook (parity only) | 99911b228855 | `build.mjs --base v9f7du2` (HOOK_U2 + `__nhcX`) |

The bytes ops registered the id with (V 79883c8c950e, delta b23ea949296a) are superseded before any counted data: the
microtask test was keyed on `e` (the scroll-derived value), which misses a frame where the spring `T` drives `x` (the
debug morph driver) with `e` unchanged. Now keyed on `r`. If P-134 lands first, this card is rebased on it and K / V
re-pinned, and ops gets the new bytes before any counted run.

**Pre-card evidence** (disclosed; not in the predictions):
- Parity run 1 on 79883c8c950e (`v9final/parity-u2-1-void.json`) is VOID: the U2 audit hook threw (`s` is
  `window.scrollY` inside the effect, not the runtime getter), so no deferred frame was audited. The t / n audits ran
  (0 mismatches) but do not count.
- Parity run 2 on c7435c24dc56 (`v9final/parity-u2-2.json`, VA 99911b228855 / e1359ab9994a as served, no page
  error, 196 s): PASS. Every deferred frame was audited two microtasks later against a fresh test: 187 deferred at 10 px
  steps (down and up) and 47 at 40 px, in both mobile and mobile-shift, 0 mismatches (`dmis`); desktop 0 deferred (the
  branch is never taken). The task-driven modes show 0 lag frames and 0 theme / sticky / pill mismatches. The rAF modes
  show the same harness entries as every earlier parity run (pill [2, 0] each; theme [1, 0] at 40 px, y 2238 / 2258 /
  4968; none in sync), so nothing new.
- The Chrome count instrument's A/A self-test (`p136/selftest-count-aa.json`, K vs K): PASS. 8 loads
  (11:22-11:25Z, shared probe slot, 160 s wall; probe.mjs and build.mjs as pinned below), all served 1b2eecc66011 /
  e1359ab9994a, no page error, 628 steps mobile and 845 desktop in every load. Medians K vs V: mobile efpNav 454.5 vs
  454, forced Layout 200.5 vs 197, forced UpdateLayoutTree 774 vs 772.5; desktop efpNav 536 vs 536.5, forced Layout 262
  vs 259.5, forced UpdateLayoutTree 1245 vs 1244.5. The tolerances come from this record and are now fixed: mobile
  efpNav 2, forced Layout 7, forced style 3, PrePaint 15; desktop 2, 5, 2, 4.

**Instruments** (sha256/12; any change is listed here with its new hash before its data).

| file | hash | what |
|---|---|---|
| `build.mjs` | 746b136c1564 | arms K, V, VA (bases v9f7d, v9f7du2, expect pins) |
| `probe.mjs` | 8172549d566a | `count --base v9f7du2 --ctl v9f7d`: arms K, V; per load a top-to-bottom scripted scroll, 10 px per rAF; trace counts (PrePaint, UpdateLayoutTree, Layout; forced = inside a script event) and API counts (elementsFromPoint, getBoundingClientRect, getComputedStyle; total and from the nav code region) |
| `simcount.mjs` | 57cbf40c547f | Simulator: `--base v9f7du2 --ctl v9f7d`, the same scroll; Timeline (forced RecalculateStyles / Layout inside script records) and, new for this card, elementsFromPoint / getBoundingClientRect calls, total and nav region |
| `p136/counts.mjs` | b93a69de05f0 | the count verdicts below, from the two records |
| `p136/score.mjs` | 86ee754f0978 | phone scorer; imports P-122's `fixes/v9-best/phone/p122/score.mjs` d1dddb910cd9 (refused if changed) |
| `p136/selftest136.mjs` | 4135f1a7752f | SELFTEST-136 OK 60. Part 1 (synthetic): items, pins, check log; counts.mjs on synthetic records (all hit = PASS; a pair dropping < 40 misses C1; a desktop forced-Layout shift beyond tol misses C5; a load serving other bytes is VOID; no Simulator record = INSUFFICIENT, never a pass; an A/A not on K bytes gives no tolerance). Part 2 (P-122's own X / S records relabeled: per-run voids, EX, ES, flicker G1 per part and BEHAVIOUR X equal P-122's score-final; GX by its rule; negatives) |
| `p136/hold136.sh`, `p136/serve136.sh` | 89434acd0604, dc3e2ee81d40 | copies of P-122's hold122.sh ec6cc97f190b / serve122.sh 0198b72d3ad9: items, arms, folders changed only |

Self-tests: `probe.mjs count --base v9f7d --ctl v9f7d` serves the same bytes as K and V (A/A); `simcount.mjs` the same
with `K:1 V:1` (its A/A runs in the first Simulator slot, before the counted loads, and is reported with them); P-107's
loads showed the instrument sees the nav cache itself (v8, nav elementsFromPoint per step C 0.998 vs V 0.641 mobile,
0.999 vs 0.672 desktop; every V load below every C load).

### Part 1: cost-card counts (Chrome and Simulator)

Loads: Chrome `probe.mjs count --base v9f7du2 --ctl v9f7d --reps 2 --vp mobile,desktop` (order K V, then V K, per
viewport; mobile 430x932 DPR 3 touch, desktop 1440x900), one shared probe slot (<= 300 s); Simulator `simcount.mjs
<rec> K:1 V:1 V:2 K:2 --base v9f7du2 --ctl v9f7d`, one shared simulator slot. A load whose served hashes are not its
arm's, or with a page error, is VOID (`probe.mjs` stops the run with no record on wrong bytes; `counts.mjs` checks
again), and the run is repeated once in the next slot; a second VOID leaves the part insufficient. The records go to
`p136/count-chrome.json` and `p136/count-sim.json` (the Simulator A/A to `p136/count-sim-aa.json`), scored by
`node fixes/nav-hit-cache/p136/counts.mjs --chrome p136/count-chrome.json --aa p136/selftest-count-aa.json --sim
p136/count-sim.json --sim-aa p136/count-sim-aa.json --json p136/counts-result.json`.

Per load: `efpNav` (nav-region elementsFromPoint calls over the scroll), forced Layout and forced style recalcs
(UpdateLayoutTree / RecalculateStyles inside script), and steps. Per arm the median over its 2 loads. A/A tolerance
`tol(k)` = max(2, 2 x the |K - V| of the A/A self-test load pair for that count and viewport).

| # | prediction | judged on | p |
|---|---|---|---|
| C1 | Chrome mobile: efpNav(K) - efpNav(V) >= 40 per load, each load pair | per pair | 0.85 |
| C2 | Chrome mobile: that drop is within 25 % of the morph-open frame count on the down scroll, `deferred` from parity run 2 (task10 mobile) / 2 | medians | 0.70 |
| C3 | Chrome mobile: forced Layout and forced UpdateLayoutTree, V <= K + tol | medians | 0.85 |
| C4 | Chrome mobile: forced Layout V < K (strictly fewer) | medians | 0.55 |
| C5 | Chrome desktop: efpNav, forced Layout, forced UpdateLayoutTree, PrePaint all within tol (U2 is inert there) | medians | 0.85 |
| C6 | Simulator: efpNav(K) - efpNav(V) >= 40 per load | per pair | 0.75 |
| C7 | Simulator: forced Layout and forced RecalculateStyles, V <= K + tol | medians | 0.80 |
| C8 | no page error in any V load, every load served its pin | all | 0.95 |

Part 1 passes when C1, C3, C5, C6, C7 and C8 hold (C2 and C4 are calibration predictions, scored, not gating). A
Simulator part that cannot run (the touch path not taken: `deferred` audit not available there, so C6 is the check) is
"insufficient", never a pass.

### Part 2: short phone no-worse check

Ticket P-136, runner iphone-runner (fix-nav-morph never uses the iPhone), profile xcode-serious (default since T-162 #3;
never pooled with another profile), driver G (WDA gesture, P-121's path-matched `fixes/v9-best/phone/p121/flick-end-v2.json`
4eb4bbc62b43: part X speed=fast, part S speed=slow; compiled-program pins X 21aaafd3a9fd, S 7312cdcd2574). U2 acts only
at the page end (the morph), so parts M and R are not run. Every G run carries `flicker-inject.mjs` 71f7b00ce40b.

Holds (each one `lock.mjs run iphone --block P-136` with an exclusive no-timing chrome-measure hold inside, as P-122):

| hold | items |
|---|---|
| H1 | sCo wgXC wgXV gXC1 gXV1 gXV2 sCc |
| H2 | sCo gXC2 gXC3 gXV3 gXV4 gXC4 sCc |
| H3 | sCo wgSC wgSV gSC1 gSV1 gSV2 sCc |
| H4 | sCo gSC2 gSC3 gSV3 sCc |

Order C V V C C V V C on X (4 a side, one spare each), C V V C C V on S (3 a side, one spare each: P-122's lesson, part
S had no spare and two path VOIDs left ES short).

VOID rules (as P-122): a hold is VOID on its wda check, a compiled-program pin, the start or end thermal gate, a Mac
sleep or dark wake (pmcheck), a failed counted item, or the time guard (no G item after 420 s); a VOID hold is re-run
whole, once; a second VOID of the same hold leaves its part short (insufficient), no further runs without a lead
ruling. A run is VOID on P-111's record rules, the served check log not naming K 1b2eecc66011 and V c7435c24dc56, the
path gate (P-121's; X: C leaves the end by >= 1600 px, V's out strokes meet the release rule; S: neither, both arms),
or a failing sentinel (sCo / sCc, voids every run since the last passing one). Never re-scripted after data.

Gates (`p136/score.mjs`): GX (P-111's G gate on X, > 50 WORSE when the V - C median is up by more than 2, NEW 250 px
cluster fails, twins 46 / 54, >= 3 valid a side); ES (P-122's V ceiling on S, 0 frames > 50 ms in into1..end, >= 2 valid
V); FLICKER (G1, V monotone blinks 0 in X and in S; >= 3 valid runs a side pooled over X and S); BEHAVIOUR (fling
parity on X, P-122's rule). Reported only: EX (V ceiling on X), GS (G gate on S), S parity.

| # | prediction | p |
|---|---|---|
| P1 | GX no-worse | 0.80 (WORSE 0.10, insufficient 0.10) |
| P2 | ES no-worse | 0.65 (WORSE 0.15, insufficient 0.20) |
| P3 | FLICKER G1 pass (no-worse) | 0.85 (WORSE 0.10, insufficient 0.05) |
| P4 | BEHAVIOUR X pass | 0.90 (FAIL 0.03, insufficient 0.07) |
| P5 | every sentinel passes first try | 0.70 |
| P6 | overall no-worse | 0.55 (insufficient 0.30, WORSE or BEHAVIOUR FAIL 0.15) |

**Landing.** Part 1 passes and Part 2 is no-worse: U2 is proposed to land (lead). Part 2 insufficient: the lead
decides (a re-run of the short part, or landing on Part 1 alone). Part 2 WORSE or BEHAVIOUR FAIL: U2 does not land; the
cause is traced first (a G run's frames, the flicker logger).

### P-136 part 2 runbook (for iphone-runner; added after the signature, no rule changed)

Everything runs from the nav-hit-cache worktree, `.claude/worktrees/agent-a277ea00c8773c1ea` (branch nav-hit-cache):
the kit, its tools (equal to main at the rebase) and `out/p136/` are there. The kit was checked on 10-05 at 11:39Z:
- `out/p136/snap` was made with `serve136.sh snap` (read-only, HASHES.txt = C 1b2eecc66011 / V c7435c24dc56 / CSS
  e1359ab9994a);
- `serve136.sh` started B, C and V, served the pinned bytes ("ok" x 3), then stopped them;
- `iphone.mjs gesture --dry-run` gave GESTURE_HASH 21aaafd3a9fd (X, fast) and 7312cdcd2574 (S, slow), equal to
  hold136.sh's pins;
- every file the PIN line names is present.

Steps (in the lead's phone order, after P-130's H4 / H5 on phone back; profile xcode-serious):
1. `cd` into the worktree and start the servers: `sh fixes/nav-hit-cache/p136/serve136.sh` (background is fine; it
   prints three `ok` lines and exits; the servers stay up).
2. Run one hold per command, H1 to H4 in order, each in the background, exactly as the hold136.sh header says:
   `TICKET=P-136 node tools/lock.mjs run iphone --owner iphone-runner --block P-136 --max-seconds 900 -- node
   tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "nav U2 P-136 H<n>"
   -- caffeinate -i -s sh fixes/nav-hit-cache/p136/hold136.sh H<n> <items>`. The items per hold are in the table above.
   Between holds, run `node tools/lock.mjs doing iphone --owner iphone-runner --between <min>`.
3. The last line is `HOLD H<n> VALID` or `HOLD H<n> VOID <why>`. A VOID hold is re-run whole, once. A second VOID of the
   same hold leaves its part short; report it, and do no more runs without a lead ruling. Nothing is re-scripted.
4. At the end: `sh fixes/nav-hit-cache/p136/serve136.sh stop`, then `node tools/lock.mjs doing iphone --owner
   iphone-runner --block none`. Tell fix-nav-morph and mgmt-ops-10 which holds were VALID.
5. Scoring (fix-nav-morph or ops; VALID holds only, block order):
   `R=out/p136/runs; node fixes/nav-hit-cache/p136/score.mjs sCo:$R/p136-sCo-H1.json gXC1:$R/p136-gXC1.json gXV1:$R/p136-gXV1.json
   gXV2:$R/p136-gXV2.json sCc:$R/p136-sCc-H1.json sCo:$R/p136-sCo-H2.json gXC2:$R/p136-gXC2.json gXC3:$R/p136-gXC3.json
   gXV3:$R/p136-gXV3.json gXV4:$R/p136-gXV4.json gXC4:$R/p136-gXC4.json sCc:$R/p136-sCc-H2.json sCo:$R/p136-sCo-H3.json
   gSC1:$R/p136-gSC1.json gSV1:$R/p136-gSV1.json gSV2:$R/p136-gSV2.json sCc:$R/p136-sCc-H3.json sCo:$R/p136-sCo-H4.json
   gSC2:$R/p136-gSC2.json gSC3:$R/p136-gSC3.json gSV3:$R/p136-gSV3.json sCc:$R/p136-sCc-H4.json --json
   fixes/nav-hit-cache/p136/score-final.json`. Warm-ups are not passed. Each run's served check log
   (`p136-<H>-check-<item>.log`) is found beside its record.

## P-136 result: part 1 FAIL as registered (C5); U2 does not land on this card

The lead ruled option (a), 10-05 ~12:00Z: the FAIL stands. The Simulator counts (C6, C7) and part 2 on the phone are
cancelled under P-136; the runbook above is not run. mgmt-ops-10 re-scored the same output from the files.

Chrome counts: `p136/count-chrome.json` (67a6b91698e0), 8 loads, 11:41-11:44Z, one shared probe slot, wall 187 s, every
load on its pin, no page error. Scored by `p136/counts.mjs` b93a69de05f0 with the A/A `p136/selftest-count-aa.json`
(9d80c7d462f0); output `p136/counts-result.json`.

| # | verdict | numbers (per load; medians unless "pairs") |
|---|---|---|
| C1 | hit | mobile nav elementsFromPoint, pairs: K 454 / 454, V 361 / 361, drop 93 / 93 (>= 40) |
| C2 | hit | drop 93 vs 93.5 (parity run 2's deferred 187 / 2; pre-card informed, ops N1) |
| C3 | hit | mobile forced Layout K 199 V 198.5 (tol 7); forced UpdateLayoutTree K 788.5 V 774 (tol 3) |
| C4 | hit | forced Layout 198.5 < 199 (a trivial margin) |
| C5 | **MISS** | desktop PrePaint K 1403.5 V 1398, gap 5.5 > tol 4; efpNav 531 vs 533 (tol 2), forced Layout 260.5 vs 263 (tol 5), forced UpdateLayoutTree 1244.5 vs 1244.5 (tol 2) |
| C6, C7 | not run | cancelled by the ruling |
| C8 | hit | 8 loads, 0 voids |

PART1 FAIL (C5 gates). Descriptive only, not part of the verdict:
- The C5 gap is all in PrePaint.frame (rendered-frame paints): K 1007 / 1006 vs V 1002 / 1000. Forced PrePaint is K 398
  / 396 vs V 397 / 397.
- In the A/A, identical bytes ranged 997-1005 on PrePaint.frame. The tolerance came from one pair's median gap (ops
  N2).
- U2's branch is never taken on desktop (parity run 2: desktop deferred 0).

Mechanism result, posted as F-283: on touch mobile U2 removes exactly one nav elementsFromPoint per morph-open frame,
93 per down-scroll, as predicted from the deferred-frame count, with no rise in forced layout or style.

## D card P-138: U2 again, post-data (rev 1, registered before its own data)

**SIGNED by the lead** (10-05, on mgmt-ops-10's pre-data read PASS, PREDICTIONS ops fb97f07d, card 9f89c835) with ops'
notes N1-N7 as conditions:
- N1: every p and the A0 cap are informed by P-136; the result read labels C1, C2, C5 and A0 as informed.
- N2: an A0 miss turns any C1, C6 or C8 miss into INSUFFICIENT; ops reports that miss beside the verdict.
- N3: `part1-138.sh` EXIT lines now carry the lock run's status (new hash d4b842ea99d0 below), before any data.
- N4: the parity input is pinned in ops' row: `v9final/parity-u2-2.json` f892a8dea0ae, deferred 187.
- N5: `p136/score.mjs` prints P-136 in its messages; accepted.
- N6: `sim-aa.json` (and `sim-kv.json`) are shared by two slots: a failure part-way takes the `.void1.json` move-aside.
  Order: Chrome steps 1-4 in shared probe slots, the A/A and its tolerances committed before any K / V run;
  Simulator steps 5-8 in drain slot 5, last.
- N7: if P-134 lands first, ops delta-checks before any counted run.

**Post-data.** This card follows the seen P-136 C5 FAIL above (lead ruling option (a), 10-05). Everything on it, the
tolerance rule, the A0 cap and every p, was written knowing P-136's records. Id P-138 from mgmt-ops-10; drain slot 5
after P-137 for its Simulator steps, only if signed by then. mgmt-ops-10 does the pre-data read, then the lead signs.
Nothing below runs before the signature.

What is new against P-136 (everything else is P-136's card, carried over unchanged):
1. **The tolerance rule, fixed now, before the A/A runs** (`p138/counts.mjs`): `tol(k, vp)` = max(2, max - min of
   count k over all loads of that viewport's A/A, both arms, identical K bytes). The A/A needs at least 3 valid loads
   per arm (3 pairs), else that viewport has no tolerance. P-136's rule (2 x one pair's median gap) is dropped.
2. **A0, a cap on the tolerances (gating).** Every tolerance C3, C5 or C7 uses must be <= max(5, 5 % of that count's
   A/A median). A wider one means the A/A is too noisy to call "unchanged": A0 misses, part 1 is INSUFFICIENT whatever
   C1-C8 say (never a pass, never a fail), and the lead decides. The 5 % was chosen knowing P-136's A/A (mobile forced
   Layout 194-202 on identical bytes, ~4 %).
3. **A fresh A/A first, then a fresh K / V**, 3 pairs per viewport each, on the same arms and pins as P-136 (K
   1b2eecc66011, V c7435c24dc56, CSS e1359ab9994a; no change). Every arm needs >= 3 valid loads.
4. **The Simulator gets 3 pairs too** (A/A and K / V), in two slots each, last in the drain.

**Reused from P-136 only as context, not scored:** `p136/count-chrome.json` (67a6b91698e0, P-136's K / V),
`p136/selftest-count-aa.json` (9d80c7d462f0, P-136's one-pair A/A), `p136/counts-result.json` (its FAIL). No P-136 load
enters a P-138 tolerance or verdict. **Reused as an input:** parity run 2 `v9final/parity-u2-2.json` (C2's reference,
deferred 187 / 2, as on P-136, ops N1). **Reused as instruments, unchanged:** `probe.mjs`, `simcount.mjs`, `build.mjs`,
`p136/counts.mjs` (P-138's scorer imports its metrics and VOID rules, pinned), `p136/score.mjs` (phone scoring).

If P-134 lands first: this card is rebased on it, K / V re-pinned, and ops delta-checks the new bytes before any
counted run (as P-136's N4).

**Instruments** (sha256/12; any change is listed here with its new hash before its data).

| file | hash | what |
|---|---|---|
| `build.mjs`, `probe.mjs`, `simcount.mjs` | 746b136c1564, 8172549d566a, 57cbf40c547f | as P-136 |
| `p136/counts.mjs` | b93a69de05f0 | P-136's metrics, VOID rules and pins; imported by `p138/counts.mjs` (refused if changed) |
| `p138/counts.mjs` | 75a3c8ce735a | part 1 verdicts: the range tolerance, A0, C1-C8, >= 3 loads per arm |
| `p138/selftest138.mjs` | 046637a88b2f | SELFTEST-138 OK 20 (synthetic): pass; range tolerance, floor 2, A/A median; a P-136-like desktop PrePaint gap inside the range hits C5; a shift beyond it misses C5 (FAIL); a C1 miss; A0 cap miss = INSUFFICIENT, also over a C1 miss; the 5 % edge; A/A or K / V with 2 per arm = no tolerance / insufficient; other bytes VOID (C8 miss); an A/A load not on K bytes VOID; no Simulator = INSUFFICIENT; a Simulator forced-Layout rise misses C7; C2's reference; the P-136 import pin |
| `p138/part1-138.sh` | d4b842ea99d0 | part 1 runner: steps `aa`, `kv`, `sim`, `score`; refuses without TICKET=P-138, refuses `kv` before `aa`, never overwrites a record; its EXIT lines carry the lock run's status, not the LAN filter's (ops N3, fixed after the signature and before any data; was 42a764437dc5) |
| `p136/score.mjs` | 86ee754f0978 | phone scorer, unchanged (same arms and bytes; its messages say P-136); tests in `p136/selftest136.mjs` 4135f1a7752f |
| `p138/hold138.sh`, `p138/serve138.sh` | ac54aedc3f3d, 7353c8a55996 | copies of `p136/hold136.sh` 89434acd0604 / `p136/serve136.sh` dc3e2ee81d40: ticket, folders (`out/p138/`), labels (`p138-*`) changed, and the PIN line names `p136/score.mjs` |

### Part 1: cost-card counts (Chrome and Simulator)

Steps, in this order, each its own shared slot (counts only, nothing timed), run by fix-nav-morph:

| step | slot | command (inside `p138/part1-138.sh`) | record |
|---|---|---|---|
| 1 | probe, <= 300 s | `probe.mjs count --base v9f7d --ctl v9f7d --reps 3 --vp mobile` (A/A, K bytes both arms) | `p138/aa-mobile.json` |
| 2 | probe | the same, `--vp desktop` | `p138/aa-desktop.json` |
| 3 | probe | `probe.mjs count --base v9f7du2 --ctl v9f7d --reps 3 --vp mobile` (K / V) | `p138/kv-mobile.json` |
| 4 | probe | the same, `--vp desktop` | `p138/kv-desktop.json` |
| 5, 6 | simulator, last in the drain | `simcount.mjs p138/sim-aa.json K:1 V:1 V:2`, then `K:2 K:3 V:3`, `--base v9f7d --ctl v9f7d` (A/A) | `p138/sim-aa.json` |
| 7, 8 | simulator | the same with `--base v9f7du2` (K / V) | `p138/sim-kv.json` |

Commands: `TICKET=P-138 sh fixes/nav-hit-cache/p138/part1-138.sh aa` (steps 1-2), `... kv` (3-4), `... sim` (5-8), then
`sh fixes/nav-hit-cache/p138/part1-138.sh score` (= `node p138/counts.mjs --chrome p138/kv-mobile.json,p138/kv-desktop.json
--aa p138/aa-mobile.json,p138/aa-desktop.json --sim p138/sim-kv.json --sim-aa p138/sim-aa.json --json
p138/counts-result.json`). probe.mjs order per viewport: K V, V K, K V; pairs are taken in record order.

VOID rules as P-136: a load whose served hashes are not its arm's (A/A: K's in both arms), or with a page error, is VOID
(probe.mjs stops on wrong bytes; counts.mjs checks again). A step with a VOID load or no record is repeated once in the
next slot (its record moved aside as `<name>.void1.json`, kept, not scored); a second VOID leaves that part
insufficient, no further runs without a lead ruling. The Chrome A/A (steps 1-2) runs and is committed before step 3.

| # | prediction | judged on | p |
|---|---|---|---|
| A0 | every tolerance C3 / C5 / C7 use is <= max(5, 5 % of its A/A median) | A/A ranges | 0.75 |
| C1 | Chrome mobile: efpNav(K) - efpNav(V) >= 40, each of the 3 pairs | per pair | 0.97 |
| C2 | Chrome mobile: that drop within 25 % of parity run 2's deferred / 2 (93.5) | medians | 0.93 |
| C3 | Chrome mobile: forced Layout and forced UpdateLayoutTree, V <= K + tol | medians | 0.90 |
| C4 | Chrome mobile: forced Layout V < K (strictly) | medians | 0.50 |
| C5 | Chrome desktop: efpNav, forced Layout, forced UpdateLayoutTree, PrePaint all within tol (U2 is inert there) | medians | 0.75 |
| C6 | Simulator: efpNav(K) - efpNav(V) >= 40, each of the 3 pairs | per pair | 0.75 |
| C7 | Simulator: forced Layout and forced RecalculateStyles, V <= K + tol | medians | 0.80 |
| C8 | no page error in any load, every load served its pin | all | 0.95 |

Part 1 passes when A0, C1, C3, C5, C6, C7 and C8 hold; C2 and C4 are calibration, scored, not gating. A0 not a hit
makes part 1 INSUFFICIENT; otherwise any gating miss is FAIL, any insufficient is INSUFFICIENT. A Simulator part that
cannot run is insufficient, never a pass. Overall part 1: PASS 0.40, INSUFFICIENT 0.35, FAIL 0.25.

Why these p (post-data): C1 / C2 rest on P-136's exact 93 / 93 drop. C5 is lower than C1 because P-136's desktop
loads on K bytes ranged 528-537 on efpNav and 1396-1405 on PrePaint: a 3-pair A/A may come out narrower than the K / V
spread. A0 is 0.75 because P-136's mobile forced Layout on K bytes already ranged 194-202 against a cap of ~10, and the
Simulator's spread is unknown.

### Part 2: short phone no-worse check (carried over from P-136)

Only after part 1 PASSES. P-136's part 2 card and runbook unchanged, with ticket P-138, `p138/hold138.sh` and
`p138/serve138.sh`, run files `out/p138/runs/p138-*`, and `TICKET=P-138 ... --block P-138` in every hold command:
runner iphone-runner (fix-nav-morph never uses the iPhone), profile xcode-serious (never pooled), driver G on P-121's
`flick-end-v2.json` (X fast 21aaafd3a9fd, S slow 7312cdcd2574), `flicker-inject.mjs` on every G run; holds H1 sCo wgXC
wgXV gXC1 gXV1 gXV2 sCc | H2 sCo gXC2 gXC3 gXV3 gXV4 gXC4 sCc | H3 sCo wgSC wgSV gSC1 gSV1 gSV2 sCc | H4 sCo gSC2 gSC3
gSV3 sCc; the same VOID rules, gates (GX, ES, FLICKER G1, BEHAVIOUR X) and scorer `p136/score.mjs` (scored into
`p138/score-final.json`). The phone order is the lead's; Simulator slots are DEFERRED during phone blocks.

| # | prediction | p |
|---|---|---|
| P1 | GX no-worse | 0.80 (WORSE 0.10, insufficient 0.10) |
| P2 | ES no-worse | 0.65 (WORSE 0.15, insufficient 0.20) |
| P3 | FLICKER G1 pass (no-worse) | 0.85 (WORSE 0.10, insufficient 0.05) |
| P4 | BEHAVIOUR X pass | 0.90 (FAIL 0.03, insufficient 0.07) |
| P5 | every sentinel passes first try | 0.70 |
| P6 | overall no-worse | 0.55 (insufficient 0.30, WORSE or BEHAVIOUR FAIL 0.15) |

**Landing**, as P-136: part 1 PASS and part 2 no-worse, U2 is proposed to land (lead). Part 2 insufficient: the lead
decides. Part 2 WORSE or BEHAVIOUR FAIL: U2 does not land; the cause is traced first. Part 1 FAIL or INSUFFICIENT: no
phone part; the lead rules.

### P-138 data log (part 1)

**Steps 1-2, Chrome A/A (committed before any K / V run).** Both A/A records are valid: 6 loads each, K bytes
1b2eecc66011 / e1359ab9994a in both arms, no page error, 0 A/A VOIDs.

| step | record | when | slot |
|---|---|---|---|
| 1 | `p138/aa-mobile.json` | 12:27-12:28Z | 628 steps per load; wall 111 s; queued 934 s first |
| 2 | `p138/aa-desktop.json` | 12:53-12:55Z | 845 steps per load; wall 143 s |

Step 2 did not come from the same `part1-138.sh aa` run as step 1. That run's desktop step was killed by the 30-min
cap on background commands while it was still queued: no slot taken, no record. Step 2 then ran alone from a scratch
copy of the same `chrome()` command (same lock arguments, the same `probe.mjs count --base v9f7d --ctl v9f7d --reps 3
--vp desktop`), because the runner's `aa` refuses once `aa-mobile.json` exists.

**Tolerances**, from `p138/counts.mjs` 75a3c8ce735a `score()` on the two A/A records alone:
`p138/aa-tolerances.json`.

| viewport | efpNav | forced Layout | forced UpdateLayoutTree | PrePaint |
|---|---|---|---|---|
| mobile (median) | 2 (454) | 6 (196) | 9 (772.5) | 5 (1226) |
| desktop (median) | 7 (533) | 8 (261.5) | 4 (1244) | 10 (1396) |

**A0, Chrome half:** every tolerance used by C3 and C5 is under its cap:

| count | tolerance | cap |
|---|---|---|
| mobile forced Layout | 6 | 9.8 |
| mobile forced style | 9 | 38.6 |
| desktop efpNav | 7 | 26.7 |
| desktop forced Layout | 8 | 13.1 |
| desktop forced style | 4 | 62.2 |
| desktop PrePaint | 10 | 69.8 |

A0's Simulator half (C7) waits for steps 5-6.

**Steps 3-4, Chrome K / V** (`part1-138.sh kv`, one run; both records valid):
- `p138/kv-mobile.json`: 6 loads, 12:58-13:05Z (slot wall 108 s), 628 steps per load.
- `p138/kv-desktop.json`: 6 loads, 13:05-13:17Z (slot wall 151 s), 845 steps per load.
- Every load served its arm's pin (K 1b2eecc66011, V c7435c24dc56, CSS e1359ab9994a), with no page error.

Interim score: `counts.mjs` on the Chrome records only. These are not the final verdict, which needs the Simulator.

| # | interim | numbers |
|---|---|---|
| C1 | hit | mobile nav elementsFromPoint, pairs: K 454 / 454 / 454, V 361 / 361 / 361, drop 93 each |
| C2 | hit | drop 93 vs 93.5 |
| C3 | hit | forced Layout K 198 V 196 (tol 6); forced style K 773 V 774 (tol 9) |
| C4 | hit | 196 < 198 |
| C5 | hit | desktop efpNav 536 / 535 (tol 7), forced Layout 262 / 259 (8), forced style 1245 / 1244 (4), PrePaint 1393 / 1392 (10) |
| C8 | hit so far | 12 loads, 0 VOIDs |
| A0, C6, C7 | pending | Simulator steps 5-8 (drain slot 5) |

**Steps 5-8, Simulator** (`part1-138.sh sim`, one run, four shared simulator slots; all exit 0):
- `p138/sim-aa.json`: A/A, 13:19-13:47Z.
- `p138/sim-kv.json`: K / V, 13:47-14:23Z.
- Every load served its pin, 608 steps each, no VOID.
- Slot 1 logged `SIM_QUIET NOT settled after 58 s`: background load was 79 % of a core, under load1 60. The card has no
  rule on this, so it is reported only. The tool's I-082 note says counts that follow frame cadence carry this
  context.

## P-138 result: part 1 PASS

Scored by `p138/counts.mjs` 75a3c8ce735a on all eight records, output `p138/counts-result.json`. N1: C1, C2, C5 and
A0 are informed by P-136.

| # | verdict | numbers |
|---|---|---|
| A0 | hit | every tolerance used is under its cap; the Simulator's are forced Layout 35 (cap ~76) and forced style 17 (cap ~30) |
| C1 | hit | Chrome mobile nav elementsFromPoint, pairs: K 454 x 3, V 361 x 3, drop 93 each |
| C2 | hit | drop 93 vs 93.5 (calibration) |
| C3 | hit | forced Layout K 198 V 196 (tol 6); forced style K 773 V 774 (tol 9) |
| C4 | hit | 196 < 198 (calibration) |
| C5 | hit | desktop efpNav 536 / 535 (tol 7), forced Layout 262 / 259 (8), forced style 1245 / 1244 (4), PrePaint 1393 / 1392 (10) |
| C6 | hit | Simulator nav elementsFromPoint, pairs: K 396 / 398 / 397, V 317 / 316 / 316, drops 79 / 82 / 81 |
| C7 | hit | Simulator forced Layout K 1523 V 1541 (tol 35); forced RecalculateStyles K 610 V 600 (tol 17) |
| C8 | hit | 18 counted loads (12 Chrome, 6 Simulator), 0 VOIDs; A/A loads 0 VOIDs |

Descriptive notes (not part of the verdict):
- **Simulator forced Layout.** It is V +18 over K, inside the A/A range of 35 (1508-1543 on identical bytes).
- **Simulator drop size.** Its drop (~80) is smaller than Chrome's 93. Its scroll is 608 steps against Chrome's 628,
  and the drop is measured on another engine. The mechanism matches: one test less per morph-open frame.

**Part 2 folds into int-v8's single v9.2 phone block** (lead, per user T-199 #3). There is no separate P-138 phone
block. `out/p138/snap` is made (`serve138.sh snap ok`) in case the lead rules otherwise.

**For v9.2:** `u2-delta-on-v91d.diff` (8b5206c8b206) is U2 against v9.1d.
- Base: v9-final + 7d + scroll-cb + g11, int-v8's `fixes/v9-1d` overlay JS 941aa13e5bdf.
- It changes the same lines as `u2-delta-on-v9f7d.diff` c0d040afe271, 159 lines lower: hunks at 14190 / 14294 /
  14475.
- `patch -p1 -F0` applies it exactly. The result JS is db0bc2262f02, and `node --check` passes.
- U2 on v9.1d has no counts of its own: P-138 measured it on v9f7d.

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
