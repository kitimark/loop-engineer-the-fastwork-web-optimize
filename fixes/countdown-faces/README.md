# Fix: countdown-faces

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts, call-tree attribution, frozen-frame pixel identity; no timing A/B by design)
**Stage:** I (instrumented and attributed); a proposal decides whether it goes on to F
**Device class / gate:** Chrome counts and call tree; WebKit counts on the Simulator. No phone timing blocks, no
timing A/B gain claim (timing was deferred project-wide when this ran).
**Driver(s) behind the claims:** Chrome CDP probe (`probe.mjs`), frozen-frame harness (`probe.mjs pixels`), Simulator
Timeline counter (`sim-counts.mjs`)
**Topic:** user thread T-024 (the countdown re-renders while nobody can see it; each digit has 10 faces)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`:
- spring/digit `$E` and its helpers (pretty 3804-3876);
- `tD` (3878-3904);
- countdown `cD` (3918-3982);
- the hero `fD`: its exit-opacity function (~4163-4172) and the `cD` call (4333);
- the morph panel's `cD` call (13160).

No CSS change.

## What the countdown costs today (research)

The countdown is `cD`: one row of `tD` numbers. Each digit is a `$E`. A `$E` holds 10 absolutely
positioned `.face` spans (0-9, `will-change: transform`), each with its own layer, and a spring `GE`
(stiffness 280, damping 18, mass 0.3, 16 ms substeps). The spring runs on rAF on every target change, i.e. every
second, and every frame writes `transform` on all 10 faces of each rolling digit.

There are two instances:
- the hero, `cD(xe, {})` at 4333;
- the morph panel, `cD(e(h), {inverse: true})` at 13160, mounted once the page reaches it.

Neither ever stops.

**Which instances render while nobody can see them** (census per `[role=timer]`: viewport, product of ancestor
opacities, `data-start-selling-scene`, content-visibility). Chrome, 430x932, 3 s windows:

| position | hero countdown | panel countdown | face style writes (base) |
|---|---|---|---|
| top (y 0) | visible | not mounted | 1620 |
| heroExit (y = vh) | **in the viewport at opacity 0** (`.hero-copy` opacity × `--exit-opacity` = 0) | not mounted | 1460 |
| pastHero / mid / end | off-screen (content-visibility:auto ancestor) | mounted at **opacity 0**, scene paused | 2730-3070 (both instances) |

So the clock rolls in four hidden cases:
1. off-screen;
2. faded out in place (the hero's exit fade): a case we found that the original brief did not list;
3. the panel's opacity-0 mount;
4. a background tab.

In a background tab the browser runs no rAF callbacks: "requestAnimationFrame() calls are paused in most browsers
when running in background tabs or hidden iframes" (CONFIRMED, MDN
`developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame`). So the tab case is already free, apart
from the 1 Hz tick.

**Per-tick work.** Base vs `still`, which is the baseline with the spring always snapping, i.e. the same page
without the roll (`results.json` → `fullPage3s`):

| 3 s window | base | still | what it means |
|---|---|---|---|
| top: face style invalidations | 1290 | 30 | ~43 writes per frame while a digit rolls |
| top: elements styled | 3218 | 2108 | +1110 |
| pastHero: elements styled | 7085 | 5607 | +1478, all of it unseen |
| countdown rAF callbacks (top / pastHero / end) | 130 / 287 / 245 | 0 | |
| layouts, paints | no countdown share | | see the claim below |
| face layers (top) | 80 (of 106) | 80 | 0 once the panel scene is paused |

- **Transform writes skip layout and paint:** CONFIRMED for compositor-layer elements. web.dev "Stick to
  compositor-only properties and manage layer count": "The best-performing version of the pixel pipeline avoids
  both layout and paint, and only requires compositing changes". The caveat is that the element must be on its own
  layer, which the faces are (`will-change: transform`). Our counts agree: the isolated base page has 0 layouts
  and 0 paints in 6 s.
- **Most of the cost is Svelte's reactive flush and style recalc, not the rAF callback itself:** OBSERVED (our own
  trace, cause not checked against Svelte docs). FireAnimationFrame takes 345-800 ms per 3 s, while the callback's
  own FunctionCall is 17-47 ms. The CPU profile below says the same: stacks that contain countdown code are only
  2% of busy time.

## What changed (PoC)

**(a) 3 faces per digit instead of 10.** Each digit has 3 slots (`__cdSlots = [0,1,2]`).
- Slot k shows cell position `p = round(v) - 1 + ((k - round(v) + 1) mod 3)`, digit `p mod 10`, at offset
  `KE(digit, v)`. That is the same offset the original face of that digit gets, clamped to ±1 cell.
- The two faces that can be inside the cell (`floor(v)`, `ceil(v)`) always have a slot.
- A face at ≥ 1 cell is hidden by `.digit { overflow: hidden }`, just as the original parks its other 8 faces.
- A node check over 110,002 values in [-1, 10] found 0 mismatches against the 10-face visible set.
- The DOM order changes. Faces are `aria-hidden`; the readable value stays in `role=timer` / `aria-label` and in
  `data-value`.

**(b) No animation while the clock can't be seen**, after apple.com's pattern (next section). `cD` computes `live`
from two gates:
- **near the viewport:** an IntersectionObserver with `rootMargin: 100% 0px`, a one-viewport lead like Apple's
  play range;
- **shown by the call site:** a new optional `active` prop.
  - The hero passes `--exit-opacity > 0`. Its exit function sets a state through module aliases, because `fD`
    shadows `N`/`z`/`s`.
  - The panel passes `morph > 0.08`, the point where its opacity formula `clamp(0, (morph - 0.08) / 0.72, 1)`
    leaves 0.

There is no tab gate (see above).

While `live` is false a digit snaps to its target, like the reduced-motion path: no rAF. It remembers the last
target change `{from, to, at}`.

**Resume (pixel identity).** When the clock becomes visible again within 1 s of a target change, the digit replays
the frames an always-running spring would have run, then continues per rAF:
- the frames are `GE(t, e, dt)` once per display interval `dt` from `at` up to now;
- `dt` is the shortest rAF gap of the last finished roll, shared by all digits, 60 Hz until learned.

This replay is required, because the original spring is **frame-rate dependent**. It runs semi-implicit Euler with
ω·dt ≈ 0.5 and steps once per rAF. A one-shot `GE(from, to, elapsed)` matches a 60 Hz chain within 0.014 px but
misses a 120 Hz chain by 3.6 px on a one-step roll and by 45 px on the 9→0 wrap. 60 Hz and 120 Hz chains of the
base differ from each other by 3.3 px (finding F-137). The whole-frame replay lands exactly on one of base's
possible trajectories (0 px outside base's own vsync-phase spread at 60 and 120 Hz;
`out/countdown-faces/chain.mjs`).

## The apple.com pattern this follows

User reference: https://www.apple.com/iphone-18-pro/, `media-card-gallery-content`. We read the public
`https://www.apple.com/v/iphone-18-pro/c/built/scripts/overview/main.built.js` and `.../styles/overview.built.css`
(no personal data sent):
- **Play range, not IntersectionObserver.** The gallery's animations play and pause from an AnimSystem scroll-range
  keyframe (`play-pause-kf`, starting one viewport early, `a0t - 100vh`): `onEnter` plays, `onExit` calls `pause()`. The bundle's only IntersectionObserver serves keyboard navigation. Neither file uses
  `content-visibility`.
- `pause()` adds the class `paused` (`animation-play-state: paused` on the progress) and pauses the TimeGroup.
  **Resume continues where it stopped; it does not restart.**
- `.gallery-item.out-of-view .card { display: none }` keeps only the slots next to the current one rendered. That is
  the same idea as keeping 3 faces.
- There is no explicit background-tab code: the browser stops rAF (INFERRED from the absence plus MDN above).

Our PoC uses an IntersectionObserver with the same one-viewport lead instead of a scroll-range engine, which this
page doesn't have. The idea matches Apple's: pause outside the play range, and continue (catch up) rather than
restart on re-entry.

## Pixel identity (frozen frames)

`probe.mjs pixels base,poc`: the arms run in order A B A, where the second A is an A/A control.
- The countdown's own clocks are virtualised. `Date.now` and `performance.now` are frozen when called from the
  countdown, and its spring rAF callbacks are queued and stepped at exact 60 Hz stamps. Everything else on the page
  runs normally.
- Screenshot clip: the hero `[role=timer]`, 384x96 CSS px at DPR 3.
- Besides the pixels, each frame records the face state: every face inside the cell, as digit@translateY to 3
  decimals.

| comparison | shots | differ in pixels | differ in face state | mid-roll shots | resume shots (mid-roll) |
|---|---|---|---|---|---|
| base vs PoC | 183 | **0** | **0** | 131 | 81 (51) |
| base vs base (A/A) | 183 | 0 | 0 | 131 | 81 (51) |

There were no blank shots and no page errors.
- **Rolls** (102 shots, each at 17 spring phases from frame 0 to frame 60): one step down, one step up, the ones
  wrap 0→9 with tens 4→3, 9→0 with tens 3→4 going up, a 4-unit carry (3d 04:00:00 → 03:59:59), and tens 10→09.
- **Resume** (81 shots): 40→39, with the clock coming back 6, 15 or 40 frames after the change, half a frame into
  the frame, shot at +0..+40 frames. Three ways of hiding:
  - the hero faded to opacity 0 (y = vh), then scrolled back;
  - more than 1 viewport off-screen, then back;
  - a tab switch: visibilityState emulated hidden, no frames stepped, a new second on return.
- Example, 6 frames after the change: both arms show `3@-5.893 4@30.107 | 7@-18.967 8@17.033` at the resume
  instant.
- In the tab case both show base's stale `40` at the return frame, then the same sweep.
- An earlier run without the 1.5 s settle after scrolling back had pixel diffs in base A/A as well, from the hero
  copy's own fade-in. Its face states were equal. The run above waits for the page to settle, and the countdown's
  frozen clock does not move meanwhile.
- The panel fade-in uses the same `active` mechanism, but the harness only checks the hero.

## Before / after: counts

All numbers are from one run (n=1) at CPU 6x; ms columns are rough. Data: `results.json`.

**Isolated page** (one countdown alone with the page CSS, 8 digits, 6 s window, visible, so it rolls):

| | base | PoC (a+b) | faces only (a) | still (floor) |
|---|---|---|---|---|
| face style writes | 3400 | **598** | 582 | 70 |
| style recalcs | 293 | 277 | 270 | 6 |
| elements styled | 3400 | **560** | 546 | 70 |
| layouts / paints | 0 / 0 | **6 / 12** | 6 / 12 | 0 / 0 |
| face-layer repaints | 0 | 11 | 2 | 0 |
| countdown rAF callbacks | 347 | 283 | 276 | 0 |
| layers (face layers) | 86 (80) | **30 (24)** | 30 (24) | 86 (80) |
| rough: tasks / style / countdown rAF ms | 677 / 43 / 226 | 306 / 16 / 78 | 297 / 27 / 77 | 49 / 4 / 0 |

**New cost of (a).** A slot's digit text changes once per roll (6 text changes in 6 s). Each change costs one small
layout and about 2 face paints per second, where base has none. That is the price of 3 faces instead of 10.

**Full page** (3 s windows; base and still from one run, PoC from a run after the frame-replay change):

| position | base writes / els styled / cd rAF / face layers | PoC | still |
|---|---|---|---|
| top (visible) | 1620 / 3218 / 130 / 80 | 283 / 2343 / 140 / 24 | 40 / 2108 / 0 / 80 |
| heroExit (opacity 0) | 1460 / 3185 / 138 / 80 | **9** / 2262 / **0** / 24 | 40 / 1638 / 0 / 80 |
| pastHero (both hidden) | 3070 / 7085 / 287 / 0 | **15** / 5599 / **0** / 0 | 60 / 5607 / 0 / 0 |
| mid | 2860 / 5800 / 251 / 0 | 15 / 5252 / 0 / 0 | 60 / 4983 / 0 / 0 |
| end | 2730 / 5592 / 245 / 0 | 30 / 5038 / 0 / 0 | 80 / 5080 / 0 / 0 |

On the full page, layout and paint counts belong to the rest of the page (orbit, cards), so they don't show the
countdown.

## Call tree (Chrome CPU profile, one normal hold)

`probe.mjs profile base,still,poc`: 100 µs sampling plus a trace, 6 s windows, CPU 6x.
- The **countdown frames** column counts samples whose stack contains countdown code (lines from `var UE` to
  `cD`'s end).
- The Svelte flush runs from the scheduler's microtask. Its stacks hold only runtime frames, so the column misses
  it. The **base − still** difference is the better attribution.

| window | busy ms base / still / PoC | countdown frames, base (share of busy) | style ms base / still / PoC | elements styled base / still / PoC |
|---|---|---|---|---|
| isolated page | 433 / 42 / 328 | 19.6 ms | 13.4 / 1.4 / 7.7 | 2760 / 70 / 683 |
| top | 2485 / 2446 / 2059 | 54.7 (2.2 %) | 128 / 101 / 123 | 8210 / 4255 / 4918 |
| pastHero | 3308 / 1984 / 2170 | 57.3 (1.7 %) | 253 / 99 / 112 | 18052 / 11342 / 11213 |
| end | 3264 / 2343 / 2030 | 76.5 (2.3 %) | 370 / 168 / 147 | 13570 / 10188 / 10140 |

**The honest size.**
- **Hidden clock:** a sizeable but rough share of the main thread. With the clock unseen (pastHero, end), base −
  still is ~920-1320 busy ms per 6 s at 6x, i.e. 28-40 % of the window's busy time. The PoC is at the still
  floor there.
- **Visible clock:** the PoC keeps most of the per-frame cost. It still runs the rAF and the flush for the rolling
  digits; it styles fewer elements per recalc and holds fewer layers.
- **Top:** at n=1 the top window is inside noise (base 2485 vs still 2446).
- **Not timing:** none of these are gain claims. They are n=1, 6x, attribution only.

## WebKit (iOS Simulator, counts only)

`sim-counts.mjs` runs in a functional Simulator session: Mobile Safari, Web Inspector Timeline, 4 s windows, plain
http on localhost. Simulator times never count, so these are record counts:

| position (Simulator y) | base RenderingFrame / RecalcStyles / Layout / Paint / countdown rAF | PoC |
|---|---|---|
| top (0) | 190 / 198 / 171 / 162 / 165 | 196 / 203 / 173 / 160 / 129 |
| heroExit (775) | 193 / 200 / 198 / 319 / 90 | 193 / 201 / 212 / 281 / 87 |
| pastHero (2560) | 208 / 197 / **211** / **186** / 215 | 150 / 123 / **114** / **84** / **0** |

- **pastHero (hidden clock):** WebKit does real work for it. Layouts drop 211 → 114, paints 186 → 84 and style
  recalcs 197 → 123 per 4 s when the PoC stops it. This fits F-081 (WebKit idle small layouts tied to the countdown
  spring's rAF).
- **heroExit:** both arms still roll there. UNRESOLVED: the Simulator's shorter viewport probably leaves the hero
  partly visible at y = innerHeight (`--exit-opacity` > 0), and then the PoC rolls by design. The decisive check is
  to read `--exit-opacity` on `.hero-copy` at that y in a session.
- **Visibly rolling digits:** the per-frame layout and paint counts are the same in both arms, as expected.

## Environment notes

- Both normal Chrome holds started in a **DarkWake**: the lock printed "host not awake at the start of this hold",
  and holds.log records display off, no full wake, system sleep prevented. `pmset -g log` shows **no sleep inside
  either hold**:
  - hold 1, 19:11:49-19:15:05Z: isolated counts for all 4 arms, PoC full-page counts and an earlier pixel run;
  - hold 2, 20:10:13-20:14:50Z: pixels (the table above) and the call-tree profile.
- These holds measure counts and frozen frames, plus the rough profile.
- The base/still/faces full-page counts come from two earlier shared-lane holds, 15:43:00-15:44:56Z and
  15:49:10-15:50:57Z. pmset shows no sleep inside them; the first sleep after them is at 15:52:37Z.
- One shared-lane pixel attempt (17:54Z) spanned a Maintenance Sleep and was killed at its cap. It is void and
  nothing from it is used: I-070 no longer keeps shared holds awake.
- The Simulator hold (20:16:28-20:17:51Z, shared lane) had no sleep inside it either.
- Countdown expiry is 2026-11-02 05:00Z. All runs here are before it; runs after it never compare.

## Risks, conflicts, follow-ups

- **Call sites owned by other topics.** The panel call site (13160) belongs to nav-morph (fix-nav-morph, parked).
  The PoC adds `get active()` there (morph > 0.08). nav-morph's lazy mount (#13) passes `get active() { return
  s(E); }` (morph > 0.001) at the same site. When both land, the panel's `active` should be the stricter one,
  morph > 0.08, where the panel's opacity leaves 0.
- **The cdwc rule** (nav-morph: `will-change: auto` on panel faces) stays compatible. Fewer faces means fewer layers
  to drop.
- **The hero exit function** (fD ~4163-4172) gains one state write. It is the same function the hero-exit topics
  touch.
- **Reduced motion** is unchanged (snap). **IntersectionObserver missing:** `near` stays true, which is base
  behaviour.
- **Resume more than 1 s after a target change** snaps. All rolls settle in under 0.6 s, so the snap equals base's
  settled value.
- **The learned display interval** is the shortest rAF gap of the last finished roll. With uneven 1 ms Safari stamps
  it can be up to ~1 ms short. The resume frame then sits within base's own jitter spread but is not equal to
  base's exact path for that phase.
- **The tab-return sweep** (base shows stale digits, then sweeps through up to 9 faces) is kept for pixel identity.
  Snapping it would be a visible change and a separate proposal option.
- **Not covered here:** phone timing and finger tests (deferred). The scenarios "scroll up", "toolbar resize" and
  "rubber band" were not run.

## Files

- `patch.diff`: the PoC (+106 -17).
- `results.json`: all counts, call tree, pixel and Simulator summaries; baseline snapshot `b1789284481295-4ad4a84a`.
- `arms.mjs`: builds the arms (`still`, `faces`) and the isolated pages under `out/`.
- `probe.mjs`: counts, profile and pixels.
- `sim-counts.mjs`: Simulator Timeline counts.
