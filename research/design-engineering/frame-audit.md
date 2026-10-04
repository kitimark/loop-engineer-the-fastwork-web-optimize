# Frame audit: every repeating script on the page, what it costs per frame, and what is left (de-frame-audit, T-066)

Design-engineering note by `de-frame-audit` (2026-10-04), for the user's idea in console thread T-066 #11/#12. The
idea, after React's "queueing a series of state updates" (react.dev/learn/queueing-a-series-of-state-updates): stop
computing every state change and compute only what reaches the frame the user sees, and drop animation work nobody
sees. The desk (mgmt-ops-10, #13) made three claims, checked here:
- Svelte already batches (`tick()` docs);
- the cost is mostly browser style, layout and paint;
- a page-wide audit would show what is left.

Code: committed baseline `site-pretty/` (snapshot pinned by `baseline.json`). JS = `_app/immutable/nodes/
2.DyWL8TcE.js`, 1-based line numbers. The best build is `fixes/best-build/patch.diff` (st6-rb2 + platform-idle +
morph-inherit, JS 65052c4a3902, CSS e0f92804c521), rebuilt in a scratch copy and served as an overlay.

**Labels:**
- **code**: read in the bundle (line numbers given);
- **data**: from the Chrome census in §2 (files in `frame-audit/`);
- **spec / source**: a reference, cited with its link and line;
- **derived**: my arithmetic or reasoning.

**Status words:** OBSERVED, CONFIRMED, REFUTED, UNRESOLVED (CLAUDE.md "Platform claims").

No timing was measured and no phone was used: counts only, in one shared-lane hold (`--shared --weight probe`).

## 0. Answer first

1. **The user's idea is right, and half of it is already done.**
   - In the baseline at rest, the countdown's spring animation kept running with no clock on screen. Mid-page and at
     the page end, that is 56-95 animation callbacks per second and a full 60 frames per second.
   - The best build drops that work: 8 frames/s mid-page and 2 frames/s at the page end, no animation callbacks
     (§2, **data**).
2. **"Svelte already batches" holds, but only within one task: CONFIRMED with a correction (§4.1).**
   - A state write queues one microtask flush.
   - Separate timers and animation callbacks each flush on their own.
   - Batching per frame would not help: the browser already restyles and lays out once per frame (HTML spec, §4.2).
3. **"The cost is style, layout and paint" holds during the scroll, but the cause is script.**
   - Script forces those passes mid-frame by reading layout.
   - The best build cut forced style recalcs 3× (246 → 78 per second).
   - Still, every scroll frame runs the rendering pipeline about twice (126 PrePaint per 60 frames), because the nav
     hit-tests the page each frame (Blink source, §4.4).
4. **What is left (§5):**
   1. the nav's per-frame hit test, page-wide;
   2. four scroll callbacks (commission, future, platform, profile) that still run on phones for effects CSS switches off there;
   3. the two countdown timers that tick while no clock is visible.
5. **Pending fixes cover the rest of the visible animation:** P-093 (countdown roll), P-094 (script at rest), P-095
   (hero exit), P-091 and P-092 (morph).

## 1. Inventory: every repeating script (baseline)

Columns:
- **trigger / rate**: what fires it and how often;
- **writes**: what it changes in the DOM or styles;
- **seen?**: whether the result is visible at that moment, on a 430 px phone;
- **browser work**: what that write or read can cost.

"Per scroll frame" means the scroll engine (`rE`/`iE` 2667-2673) calls it once per rAF while the page scrolls, and
only while its section passes the IO gate `uE` (2719-2747, rootMargin 100 %, so ±1 viewport) unless noted.

### 1.1 Driven by scrolling (scroll engine `dE`, 2749-2783)

| # | where (lines) | trigger / rate | writes / reads | seen? (phone) | browser work |
|---|---|---|---|---|---|
| S1 | nav `dN` `_` 13000-13011 (+ `F` 12955-12963, `ee` 12964-12977) | every scroll frame, **page-wide**: `dE(L)` at 13090 has no element, so no gate | getComputedStyle + 2 rects (`ee`); pointerEvents write → `elementFromPoint` → restore (`F`) | the nav colour follows the section under it: yes, at section borders only | forced style + layout per frame; hit test |
| S2 | commission `AE` `a` 3106-3126 | per scroll frame + easing tail, gated | 2 rects, `--commission-enter-shrink`, `--commission-shrink`, `d.style.height`; `j()` Range.getClientRects 3092-3099; 3 matchMedia (`A()`) | no: the shrink is a desktop effect | style + layout per frame |
| S3 | hero `fD` exit `s` 4163-4172 | per scroll frame (`dE` at 4239) | hero-track rect, `--exit-opacity`, pointerEvents | yes, while the hero leaves | style (opacity var) + rect read |
| S4 | pain `hD` `d` 4728-4731 | per scroll frame (`dE` at 4736, rootMargin 150 %) | rect read + an empty no-op state write `z(T, [])` | no | layout read |
| S5 | profile `uM` `f` 10928-10970, phone path `d()` 10923-10927 | per scroll frame + easing | phone: `h.style.height=''`, `--profile-scale 1`, querySelector, `z(w, true)`: the same values every frame | no (identical values) | JS only: identical inline writes are no-ops in both engines (§4.3, CONFIRMED) |
| S6 | profile deck `xe` 10903-10912, `be` 10890 | horizontal deck scroll: setTimeout 150 ms + rAF; scrollend at 10868 | active card index | yes (user swipes the deck) | small |
| S7 | future `mM` `l` 11303-11326 | per scroll frame while #people is active | querySelector `.hero-track` + rect, `g` rect, `--future-shrink` + easing, querySelector `.pain`, `v` rect, `is-pain-dark` toggle | shrink: no on the phone; dark switch: yes, once | 3 rects + 2 querySelectors per frame; the class toggle restyles the section |
| S8 | platform `GM` `n` 12436-12443 | per scroll frame (`dE` at 12448) | rect read, `z(u, eased)` → `--platform-shrink` | no on the phone | style per frame |
| S9 | roles `WD` `A` 6204-6215 | per scroll frame (`dE` at 6269) | returns at once without an open tooltip | — | negligible |
| S10 | engine `sE` 2689-2708, `cE` 2709-2714 | on section (de)activation | double rAF, rect read, `--start-selling-intrinsic-block-size`, `data-start-selling-render=deferred`; `data-start-selling-scene` | no (bookkeeping) | one style + layout per flip |
| S11 | nav morph `T` 13020-13023, `S()` 13013-13018 | spring rAF near the page end; wheel/touchmove capture listeners 13049-13065, **non-passive**, armed by an IO (rootMargin 200 %) at 13082-13088; timeout 1140 ms at 12999 | `--morph-fade`, pin `scrollTo` (`L` 13077-13079) | yes (the morph) | style per frame; non-passive listeners make the compositor wait for the main thread |

### 1.2 Driven by time (timers and rAF loops)

| # | where (lines) | trigger / rate | writes | seen? (phone) | browser work |
|---|---|---|---|---|---|
| T1 | countdown `cD` 3918-3982 | `setInterval` 1 s (3936) + visibilitychange; **no visibility gate** | 4 digit states | yes in the hero / morph panel, no elsewhere | one Svelte flush per second |
| T2 | countdown digit `$E` 3823-3876, spring `GE` 3791-3803 (stiffness 280, damping 18, mass 0.3) | a rAF spring per changed digit per second (3828-3841) | inline `translateY` on 10 faces per digit (8 digits × 10 = 80 faces, two clocks) | yes while the clock is on screen | style per frame for ~26 frames at 60 Hz (433 ms) / ~47 at 120 Hz (392 ms): about 43 % of all frames each second (**derived**) |
| T3 | countdown `bind offsetHeight` 3873 | ResizeObserver | cell height | — | forced layout on resize only |
| T4 | hero accent `HE` 3670-3723 | timer chain: first idle 2200 ms, then 1250 ms idle, 900 ms draw-out, 900 ms draw-in (≈3.05 s per cycle); IO rootMargin 100 % | state → classes + the shown word (CSS stroke-dashoffset, width) | yes in the hero, **no** for a viewport below it | style + layout (width) per cycle; paint every frame while the stroke draws |
| T5 | ring splash `fD` `f` 4186-4202 | rAF every frame for 1.82 s at load / pageshow, **desktop only** (> 600 px) | 3 vars × 4 orbit cards + `--ring-motion-blur` | n/a on the phone | — |
| T6 | commission fee visual `JT` loop 2424-2520 | IO threshold [0, .05, .2]: runs while any part is visible. Per cycle: 10 state resets, waits 80/420 ms, types at 28 ms per char, waits 180/480 ms, rAF count-up 1100 ms (progress width 2587), waits 120 ms, rAF tween 900 ms, waits 1600/900 ms. A ResizeObserver writes `--visual-scale` | text, number, width | yes while visible | style + layout (width) per frame during the count-up and tween; a text node per char |
| T7 | commission IO entry timer | 900 ms once on entry | class | yes | one flip |
| T8 | pain `hD` interval 4689-4703 | `setInterval` 3 s while ≥ 12 % visible | slide index → `le` 4590-4646 (returns early on narrow screens via matchMedia) | partly | one flush per 3 s |
| T9 | future `mM` avatar rotator `_` 11345-11358 | timers 800 + 220 ms (≈1020 ms per slide) while the #people scene is active | `z(S)` is-sliding, `z(x)` index (template swap) | yes when the row is on screen; scene-active is wider than on-screen | one restyle + DOM swap per second |
| T10 | agents typing `yM` 11606-11659 | while ≥ 35 % visible: wait 700 ms, type at 32 ms per char, 700/280 ms, hold 3000 ms, delete at 18 ms per char | text state | yes | a text node change every 18-32 ms; layout of the line |
| T11 | profile count-up `EM` 11994-12038 | on entry (≥ 35 %): one 1080 ms rAF tween | 4 numbers per frame | yes | text per frame for 1 s, once |
| T12 | secure network `NM` 12196-12230 | when visible, after 1 s: `beginElement` on SMIL `<animate>` | SMIL attributes | yes | SVG repaint per frame while it plays |
| T13 | roles `WD` timers 6221, 6243-6257 | on IO entry | tooltip demo state | yes | small |
| T14 | language menu `oN` 12728, modal `EE` 2893 | user action only | — | — | not repeating |

### 1.3 Framework and event listeners (chunks)

| where | trigger | note |
|---|---|---|
| `BSBv9QXB.js` 258-266 (microtask queue), 857+ (Batch class), 1067-1077 (`static ensure`), 1105-1117 (`flushSync`) | every state write | Svelte 5 runtime: one batch per synchronous task, flushed in a microtask (§4.1) |
| `BSBv9QXB.js` 2886, 3127 | MutationObserver, ResizeObserver helpers | used by `bind:` directives |
| `D313Dngs.js` 819-860 | floating-ui `autoUpdate` | only while a popover is open |
| `entry/app.HSR43Bkx.js` 1123 | TanStack Query `refetchInterval` | not configured by the page nodes, so off (**code**) |
| `CzkAa0og.js` 1185-1197 | SvelteKit link preload IO + hover | on link entry / hover only |
| JS 7046, 11250 | delegated `pointermove` etc. via `g([...])` | only on pointer input |
| JS 4732-4735 | pain window pointermove/up/cancel | only on pointer input |
| JS 11246 | future deck scroll listener | only on deck scroll |
| JS 2674-2679 (`aE`) | window scroll + resize, passive | drives §1.1; **a phone toolbar resize re-runs every active callback** |

## 2. Counts (Chrome census, no timing)

**Setup.**
- One hold on 2026-10-04 ~05:15Z: `lock.mjs run chrome-measure --shared --weight probe`, Chrome 154.0.8037.97
  headless, 430 × 932, DPR 3, mobile + touch, **no CPU throttle**, `serve.mjs --https` (vendors blocked).
- 6 s rest windows (after 2 s settle) at y 0 (hero), 1400 (hero track, clock still on screen), 2796 (#people /
  profile), 3800 (commission) and 5346 (page end, morph panel). Then one scripted scroll top → end, 10 px per rAF,
  ≈ 8.9 s, 535 steps ≈ 60 steps per second.
- Headless Chrome renders at 60 Hz here. One run per arm: these are **counts of work**, not timings; a frame count
  can move by a few per second with the phase of the countdown or the accent.
- In the data tables, the trace's FunctionCall line numbers are 1-based and match the files (checked: `rE` 2667,
  spring rAF 3836).

### 2.1 Work per second

| window | build | main frames | style recalcs | elements restyled | layouts | layout dirty objects | paints | rAF fires | timer fires |
|---|---|---|---|---|---|---|---|---|---|
| rest y 0 | base | 60 | 60 | 622 | 28.8 | 363 | 108 | 27 | 3.7 |
| | best | 49 | 49 | 422 | 1.8 | 34 | 143 | 30 | 5.0 |
| rest y 1400 | base | 49 | 49 | 746 | 29 | 368 | 141 | 30 | 4.3 |
| | best | 49 | 49 | 555 | 2 | 34 | 151 | 26 | 5.2 |
| rest y 2796 | base | 60 | 60 | 1816 | 14.3 | 165 | 167 | 64 | 4.3 |
| | best | **8.2** | 8.2 | 122 | 1 | 12.5 | 8.7 | **0** | 4.3 |
| rest y 3800 | base | 60 | 60 | 1320 | 18 | 418 | 145 | 95 | 6.5 |
| | best | 29 | 29 | 252 | 14.5 | 330 | 38 | 20 | 6.5 |
| rest end | base | 60 | 60 | 744 | 0 | 0 | 120 | 56 | 2 |
| | best | **2.2** | 2.2 | 19 | 0 | 0 | 8.8 | **0** | 2 |
| scroll | base | 128 | **246** | 6257 | 37 | 478 | 294 | 366 | 11.6 |
| | best | 126 | **78** | 2063 | 22 | 272 | 247 | 310 | 11.7 |

### 2.2 Which page code entered, per second (top entries; trace FunctionCall into the page node)

| window | base | best |
|---|---|---|
| rest y 0 | countdown spring rAF 3836: 27; rotator timer 11332: 1.8; countdown interval 3932: 1; accent timers 3693/3699/3704: 0.3 each | spring 30 (clock on screen); rotator 2; interval 2; accent 0.3 each |
| rest y 1400 | spring 30; rotator 2; interval 1; accent; pain `le` 4590: 0.3 | spring 26; interval 2; rotator 1.8; accent; pain 0.3 |
| rest y 2796 | **spring 64 (no clock on screen)**; interval 2; rotator 2; pain 0.3 | interval 2; rotator 2; pain 0.3 |
| rest y 3800 | **spring 75**; fee visual rAF `d` 2452: 20; fee timer 2435: 4.2; interval 2 | fee rAF 20; fee timer 4.2; interval 2 |
| rest end | **spring 56** (the morph panel's clock, hidden) ; interval 2 | interval 2 |
| scroll | spring 60.5; `rE` 60; `iE` 60; commission `a` 45; future `l` 36; profile `f` 34; hero exit `s` 31; platform `n` 31; profile count-up 12006: 7.4; fee timer 4.6; agents typing 11625: 2.7; interval 1.9 | `rE`/`iE` 60; `a` 45; `l` 36; `f` 34; `s` 31; `n` 31; count-up 7.4; spring 5.8; fee 4.6; typing 2.7; interval 2 |

### 2.3 What the counts say

- **At rest, the baseline's main cost was invisible work.**
  - At mid-page and at the page end, no clock is on screen, yet the countdown spring fired 56-95 rAF per second.
  - That kept Chrome at a full 60 frames per second with 750-1800 elements restyled per second.
  - The best build stops this (countdown-idle-raf): 8.2 frames/s at y 2796, 2.2 at the end, and 0 rAF.
  - This is the user's idea already applied: work nobody sees is dropped.
- **What is left at rest is mostly visible:**
  - in the hero: the countdown spring (~45 % of frames, 26-30 rAF/s, as derived in T2) and the accent stroke;
  - at the commission: the fee visual's count-up (20 rAF/s, 14.5 layouts/s).
  - These are P-093 (cd-roll-ca) and P-094 (rest-script).
- **The only invisible work left at rest** is the two countdown intervals (2 timer fires/s, ≈2 frames/s, ~19 elements
  restyled/s at the page end) and the rotator's 2 timers/s at y 2796.
- **During the scroll, forced style is down 3×** (246 → 78 style recalcs per second, 6257 → 2063 elements). But:
  - PrePaint still runs about twice per frame (126 vs 60 frames) in both builds: the nav hit test (§4.4);
  - the five per-frame scroll callbacks still enter in both builds at the same rate (`a` 45, `l` 36, `f` 34, `s` 31,
    `n` 31 per second). On a phone three of them (commission, future, platform) compute effects that CSS turns off.
  - Their bodies are cheaper in the best build; they are not skipped.

## 3. Coverage: what the best build and the open fixes already handle

Sources:
- the best build is `fixes/best-build/patch.diff` (landed: st6-rb2, platform-idle, morph-inherit, and what they stack
  on);
- the other states come from `fixes/PROGRESS.json` on 2026-10-04 (cd-strip landed; P-091…P-095 open).

"Pending" = a proposal or block that has not landed yet.

| item | best build (landed) | open fix | left after both |
|---|---|---|---|
| S1 nav `_` (page-wide) | nav-hit-test: no pointerEvents writes, `elementsFromPoint`, cached querySelectors | P-091 nav-morph (the morph IO frame) | **getComputedStyle + 2-3 rects + a hit test on every scroll frame, page-wide, ungated** |
| S2 commission | commission-forced-layout: cached MQ, `j()` only on a compact flip, phone snap, write on change | — | covered |
| S3 hero exit | — | P-095 hero R2 (scroll-driven exit, off the main thread) | covered when P-095 lands |
| S4 pain `d` | pain-offscreen-notes: return before the rect read and the no-op write | — | covered |
| S5 profile phone `d()` | MQ caching only | — | identical writes each frame: JS only (§4.3) |
| S7 future `l` | phone-invisible-shrink: no `--future-shrink` write and no easing loop on phones | — | **3 rects + querySelector `.pain` per frame while #people is active**; the `is-pain-dark` toggle (one restyle, needed) |
| S8 platform | phone-invisible-shrink | — | rect read per frame (small) |
| S10 engine | st6: scene scope, one-way render deferral, far re-skip, /10 idle unskip, will-change windows | — | covered |
| S11 morph | morph-inherit; F3 arm-scope (touch listeners on #platform + nav only, armed once, still non-passive); morph panel mounted lazily; pin clamp | P-092 morph-gpu, P-091 nav-morph | non-passive touchmove on two subtrees (needed for the morph's preventDefault) |
| T1 countdown interval | — | — | **1 s interval + a Svelte flush on every page position, also when both clocks are off-screen** |
| T2 countdown spring | countdown-idle-raf: spring only while the clock is on screen (IO, 64 px margin); cd-strip (landed): one strip per digit, not 10 faces | P-093 cd-roll-ca (WAAPI roll, no per-frame JS) | covered when P-093 lands |
| T4 hero accent | accent width by a WAAPI FLIP (no layout per cycle) | illusion-proposals keep today's drawing | paints every frame while the stroke draws (seen, kept by the illusion rule). Its IO reaches one viewport past the hero, but in the census its timers fire only at y 0 and 1400, where the hero clock is still on screen, and not at y 2796 (**data**): no measurable off-screen waste |
| T6 fee visual | `--fee-progress` var in place of the width | P-094 rest-script (rAF only on a text change) | typing text nodes while visible (needed) |
| T8 pain interval | — | P-094 (no interval on narrow screens) | covered when P-094 lands |
| T9 rotator | st5/st6: 5 persistent slots, src in place, is-sliding toggle | P-094 (pause when the row is > ½ viewport off) | covered when P-094 lands |
| T10 agents typing | — | — | **a text change every 18-32 ms while ≥ 35 % visible** |
| T11 profile count-up | — | P-094 (skip state writes) | one-shot, small |
| T12 secure network SMIL | platform-idle G1: SMIL → CSS transform glint; PMsweepGate pauses the title sweeps off-screen | anim-transform (parked) | covered |
| toolbar resize (`aE`) | — | — | **every active callback re-runs on each resize** (Chrome can't show it; UNRESOLVED on the phone) |

## 4. Platform claims

### 4.1 Svelte batches state writes per microtask, not per frame: CONFIRMED (with a correction)

- **Version.** The bundle registers Svelte major `5` (`chunks/xihTtKlq.js:1`). It ships the `fork` API, which the
  Svelte CHANGELOG adds in 5.42.0 ("feat: experimental `fork` API", `packages/svelte/CHANGELOG.md` line 1297 at
  tag `svelte@5.42.0`). Its `Batch.ensure` has the newer shape (below). So the build is a Svelte ≥ 5.42.0
  (**code** + **source**; the exact patch release is UNRESOLVED and does not matter here).
- **What a write does.** In sveltejs/svelte tag `svelte@5.42.0`, `packages/svelte/src/internal/client/reactivity/
  sources.js`:
  - `set` (line 144) calls `internal_set`;
  - `internal_set` returns without work when the value is equal (`if (!source.equals(value))`, 172-173);
  - otherwise it calls `Batch.ensure()` (184) and marks the reactions (`mark_reactions` 219).
  On `main` (7c2fcdae6a29fb3b36855dc8e86eb7ce4c56b93a) the same code sits at `set` 149, `internal_set` 189-200,
  `mark_reactions` 253.
- **When it flushes.** `packages/svelte/src/internal/client/reactivity/batch.js`:
  - at `svelte@5.42.0`: `flush()` 310, `static ensure()` 490-507, `Batch.enqueue` → `queue_micro_task` 512,
    `flushSync` 542;
  - at `main` 7c2fcdae: `static ensure()` 915-927 (`queue_micro_task` at 920), `flushSync` 1033.
  - The bundle's `cn.ensure` (`BSBv9QXB.js` 1067-1077) has the same shape: the first write in a task creates the
    batch and queues one microtask that flushes it.
- **Docs.** svelte.dev/docs/svelte/lifecycle-hooks, `tick`: "`tick` returns a promise that resolves once any
  pending state changes have been applied, or in the next microtask if there are none."
- **Spec: when that microtask runs.** HTML, "clean up after running script": "If the JavaScript execution context
  stack is now empty, perform a microtask checkpoint." (html.spec.whatwg.org/multipage/webappapis.html). So the
  flush runs at the end of **each** timer callback, rAF callback or event handler, not once per frame.
- **Verdict.**
  - The desk's claim "Svelte already batches" holds within one task.
  - Writes from separate timers, rAF callbacks or events flush separately.
  - Two loops writing state in the same frame (e.g. countdown spring + typing timer) cause two DOM updates.
  - They still cause only **one** style and layout pass, unless something reads layout in between (next point).
  - Equal writes cost nothing in Svelte (the `equals` check).

### 4.2 The browser already coalesces style and layout to once per rendering update: CONFIRMED

- HTML "update the rendering" (html.spec.whatwg.org/multipage/webappapis.html, event-loop processing model):
  - it runs the animation frame callbacks;
  - then, once per rendering opportunity, "Recalculate styles and update layout" for the document.
- So DOM writes from many callbacks in one frame are styled and laid out together.
- The exception is a **forced** synchronous style or layout: a read such as getBoundingClientRect,
  getComputedStyle or elementFromPoint after a write in the same task. That is the pattern in S1, S2, S7 (**code**).
- Hidden documents may get far fewer rendering opportunities (same section), but timers still fire.
- Consequence for the user's idea:
  - the "compute only what affects the frame" part is already done by the browser for style and layout;
  - what is left is (a) script and state work for things nobody sees, (b) forced reads, and (c) paint of things
    that change while off-screen or that change every frame.

### 4.3 Writing the same inline style value again does nothing in Blink and WebKit: CONFIRMED

- **Blink**, chromium/chromium main d5fd7217fb66e57b64eed42d0e091bd1aba9d33b,
  `third_party/blink/renderer/core/css/abstract_property_set_css_style_declaration.cc` 254-280: a `kUnchanged`
  set result ends in `DidMutate(kNoChanges)`.
- **WebKit**, WebKit/WebKit main 4d3000d891d2286f283c981cede987a25ab6cebb:
  - `Source/WebCore/css/CSSStyleProperties.cpp` 417-441: `didMutate(changed ? PropertyChanged : NoChanges)`;
  - same file 622-624: `InlineCSSStyleProperties::didMutate` returns on `NoChanges` without invalidating style;
  - `Source/WebCore/css/MutableStyleProperties.cpp` 222-223: `if (*toReplace == property) return false`.
- So the profile phone path (S5) and the parked countdown faces cost only script and CSS parsing, not a restyle.
  Removing them is a JS-time win only.
- These GitHub sources were read with the logged-in `gh` CLI (`gh api …/contents/<path>?ref=<sha>`), per user
  rule T-071.

### 4.4 A hit test (`elementFromPoint` / `elementsFromPoint`) runs every rendering phase except paint, in Blink: CONFIRMED

- chromium/chromium d5fd7217fb66e57b64eed42d0e091bd1aba9d33b:
  - `third_party/blink/renderer/core/dom/tree_scope.cc`: `ElementFromPoint` → `HitTestPoint` → `HitTestInDocumentImpl`
    (238-253, 260-273), and `ElementsFromPoint` (414-430), both call `LayoutView::HitTest`.
  - `third_party/blink/renderer/core/layout/layout_view.cc` 123-150: `LayoutView::HitTest` calls
    `GetFrameView()->UpdateAllLifecyclePhasesExceptPaint(DocumentUpdateReason::kHitTest)` before it tests.
- So nav-hit-test's switch to `elementsFromPoint` removed the two style writes, but each scroll frame still runs
  style, layout and pre-paint once inside `_` (13000-13011, which calls `F` 12955-12963 every frame, before the
  phone's early return at 13003).
- That matches the census: PrePaint runs 126-128 times per second during the scroll at 60 fps, about twice per frame,
  in **both** builds (§2, **data**).
- WebKit's `elementFromPoint` also updates layout first. I did not check its source here: UNRESOLVED for the phone's
  cost. Decisive check: a Simulator functional probe that counts layouts with and without the per-frame hit test.

### 4.5 Other claims used

- **Non-passive touchmove/wheel listeners make scrolling wait for the main thread** (S11): CONFIRMED.
  DOM Standard, "passive" flag on event listeners (dom.spec.whatwg.org/#dom-addeventlisteneroptions-passive) and the
  Chrome intervention it rests on. The phone-side size of this cost is not measured here.
- **A phone toolbar resize re-runs every active scroll callback** (`aE` listens to `resize`, 2674-2679): **code**.
  Whether Safari fires `resize` on every toolbar step is UNRESOLVED here. Decisive check: a Simulator functional
  probe counting `resize` events during a toolbar collapse.

## 5. What is left, ranked (counts × scope)

Rank = how much work the census shows × how much of the page and time it covers. Not ranked by milliseconds: no
timing was measured. Each item names a candidate mechanism in one line; none is implemented.

1. **Nav hit test every scroll frame, whole page** (S1, `_` 13000-13011 → `F` 12955-12963, `ee` 12964-12977).
   - About one extra style + layout + pre-paint pass per scroll frame in both builds (PrePaint 126-128/s at 60 fps,
     §2.1; source §4.4). Also a getComputedStyle and 2-3 rects.
   - It runs on every scroll frame from top to bottom, on the phone too (the hit test runs before the early return).
   - *Candidate:* decide the nav state from section edges cached by a ResizeObserver plus `scrollY` (no hit test,
     no getComputedStyle), recomputed only when a cached edge is crossed. The output is identical by construction
     when the cached edges are right.
   - Owner: nav-hit-test / fix-nav-morph (cluster B).
2. **Scroll callbacks for effects CSS turns off on phones** (S2 commission `a`, S7 future `l`, S8 platform `n`;
   S5 profile `f` is the same case).
   - About 146 entries per second during the scroll in both builds, each reading 1-3 rects (§2.2).
   - The best build skips their writes on phones, not their reads or their scheduling.
   - *Candidate:* do not register them with the engine (`dE`) while the same media query that CSS uses says the
     effect is off; register again on a `change` event. That is "compute only what reaches the frame", literally.
   - Keep the one read that drives a visible switch: the future card's `is-pain-dark` toggle. An IO with a threshold
     at the switch line can drive it.
3. **Countdown intervals with no clock on screen** (T1, `cD` 3918-3982, two clocks).
   - 2 timer fires and ≈2 frames per second everywhere, also at rest at the page end (§2.1, best: 2.2 frames/s).
   - Small per second, but it is the last thing that keeps a page at rest from being fully idle, which counts for
     heat.
   - *Candidate:* pause both intervals while neither clock is in an IO and the tab is hidden. On entry, recompute
     from `Date.now()` before the first paint: same digits, no animation of the skipped seconds.
4. **Agents typing** (T10, `yM` 11606-11659).
   - A text change every 18-32 ms while ≥ 35 % visible (**code**); it appears in the scroll only (2.7 timer
     entries/s). Not in a rest window.
   - Visible work, so only cheaper, not skipped.
   - *Candidate:* lay the full line out once and reveal it with a stepped `clip-path` or width, in the
     typing-chunks style. It must be pixel-identical (illusion rule): check that the line never re-wraps
     mid-word.
5. **Toolbar resize** (`aE` 2674-2679).
   - Each `resize` re-runs every active scroll callback. Chrome can't show this; UNRESOLVED on the phone (§4.5).
   - *Candidate:* ignore height-only resizes below ~120 px for the callbacks that only depend on width.
6. **Profile phone path writes identical values** (S5 `d()` 10923-10927).
   - JS and parse cost only: both engines skip an identical inline write (§4.3).
   - *Candidate:* write on change, as commission-forced-layout did.

Already covered or pending, so not ranked:
- the countdown spring: countdown-idle-raf off-screen; cd-strip; P-093 on screen;
- the fee visual count-up and pain interval: P-094;
- the rotator off-screen: P-094;
- the hero exit: P-095;
- the morph: P-091 / P-092;
- the secure-network SMIL and the title sweeps: platform-idle;
- the scene scope and render deferral: st6.

Not a target:
- **Svelte batching.** It already holds per microtask (§4.1). A frame-level batch on top would save nothing,
  because the browser already styles and lays out once per frame (§4.2). The extra passes in §2 come from forced
  reads (items 1-2), which batching does not touch.

## 6. Files

- `frame-audit/census.mjs`: the one-off probe. Headless Chrome 430 × 932, DPR 3, mobile + touch, no CPU throttle.
  - Rest windows of 6 s at y 0, 1400, 2796, 3800 and the end.
  - A scripted scroll top → end at 10 px per rAF.
  - Counts per second: PrePaint main frames, UpdateLayoutTree (+ elements), Layout (+ dirty objects), Paint,
    FireAnimationFrame, TimerFire, and FunctionCalls into the page node by line:col.
  - Run through one `lock.mjs run chrome-measure --shared --weight probe` hold.
- `frame-audit/census-base.json`, `frame-audit/census-best.json`: its output.
  - Counts and line:col keys only, no code text.
  - Function names are the bundle's minified one-letter names.
