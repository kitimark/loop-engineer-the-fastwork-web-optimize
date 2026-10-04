# Fix: nav-hit-cache

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch-on-best.diff` and `patch.diff` contain excerpts of Fastwork's code: keep them on local branches,
> never push.

**Status:** draft (ticket written, no data yet)
**Stage:** I (implemented on the best build); the counts ticket below is for ops to read before any data
**Device class / gate:** less-work fix (memory `less-work-landing-rule`): Chrome + Simulator work counts, then one short
phone no-worse check
**Driver(s) behind the claims:** Chrome scripted scroll (counts only), Simulator scripted scroll (counts only)
**Prediction:** `fixes/PREDICTIONS.md` P-<pending, asked of mgmt-ops-10> (the D card below)
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

## D card P-<pending> (pre-registered; committed before its data)

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
| nav `elementsFromPoint` per step | 1.0 | 0.03 to 0.5 (= the share of steps that still test) |
| nav `getComputedStyle` per step | 1.0 | 0 (only at re-measures, under 0.02) |
| Chrome Layout / UpdateLayoutTree / Paint per step, total | as measured | within ±0.05 of C |
| Sim forced Layout per step | 0 to 1.2 | 0 to C (no prediction on the size: UNRESOLVED) |
| Sim RecalculateStyles / Layout / RenderingFrame per step | as measured | within ±0.05 of C |

**What happens next, whatever the result.**
- *Pass:* the Chrome judged counts are lower, the guards and the Sim are no worse, and parity holds. Next: one short
  phone no-worse check (scripted S, 1 warm-up + C V V C on the current best phone ticket, the lead's slot). Then a land
  request with `patch.diff` (against the baseline, via `node tools/fix.mjs diff`).
- *Parity fails:* not landable. Fix the trigger that missed (the audit names the scrollY and the answer), re-ticket, and
  re-run all parts.
- *Counts not lower:* report it as the measured outcome, look at which trigger keeps the test on (a per-trigger tally in
  an exploratory VA run), and re-ticket. No retuning against this card's data.

## Risks, conflicts, follow-ups

- **A trigger the cache does not see.** For example, a child class flip that moves geometry instantly, with no
  transition and no class change on a theme section. The audit is the check, and it covers both scroll directions and
  two speeds. Reduced motion and touch flings are not in the audit (scripted scroll only).
- **fix-scroll-cb (scroll callbacks off on phones).** If they stop registering the commission / future / platform
  callbacks on phones, the `shrinking` / `entering` / `is-visible` classes may stop flipping there. This fix reads those
  classes as triggers. The audit must be re-run on their build before both land together (agreed: they tell me first).
- **Optional later.** Share the hero-track progress ≥ 0.72 value with fix-scroll-cb (their suggestion), so that one
  reader computes it.
- **History.** N12 v5's history and its probe stay in `fixes/nav-scroll-handler/` (brought over from the work branch,
  absolute paths scrubbed). v5 is superseded by this fix.
