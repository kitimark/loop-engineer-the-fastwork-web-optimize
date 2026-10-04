# Fix: morph-scroll (PROPOSAL)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** proposal build (motion change, so a user decision; lead ruling T-082 #5 item 1). Nothing timed has run.
**Stage:** F (proposal). Stage B (a CSS scroll-driven animation) is out while it is UNRESOLVED.
**Device class / gate:** touch phones only: not reduced motion, `(hover: none) and (pointer: coarse)`, and the short
screen side at most 600 px. Desktop, tablets and reduced motion keep today's jack (checked in Chrome at 1440x900).
**Driver(s) behind the claims:** Chrome frozen frames (430x932 DPR 3, touch) and Simulator functional sessions
(scripted `scrollTo`, frozen frames). No G or F driver yet: touch, snap and toolbar effects need one before landing.
**Owner:** fix-hero-exit-threaded. Coupled to fix-nav-morph (setter and gate, its go-ahead for this proposal build)
and fix-morph-gpu (rev 2 A and `__rvPrepNow`).

## Builds

| name | what | JS / CSS (sha256, 12) | snapshot |
|---|---|---|---|
| A (Try-it A) | best build B-R2: `fixes/hero-exit-threaded/patch.diff` (168233b0a4ae) | 8018ce062d30 / 71b65c667720 | `out/snapshots/best-BR2-8018ce062d30` |
| msbase | B-R2 + morph-gpu rev 2 A (`fixes/morph-gpu/rev2/delta.diff`, `__rvPP = !1`) + `__rvPrepNow` (`prepnow.diff`) | a0739922588f / 965671668731 | `out/snapshots/msbase-a0739922588f` |
| msbasehook | msbase + `window.__fwMorphSet(m)` (morph-gpu's frozen-frame hook, byte for byte) | 55bc51690e15 / 965671668731 | control for every frame below |
| ms (Try-it B) | msbase + this change (`delta.diff`) | see "Current build" | `out/snapshots/ms-<js12>` |

`node fixes/morph-scroll/build.mjs` rebuilds all three snapshots from B-R2 and writes `delta.diff` (the proposal
against msbase). `patch.diff` is the whole stack against the baseline (`node tools/fix.mjs diff morph-scroll`).

## The idea

Today, on a phone, the end of the page "jacks" the scroll: once the page reaches #platform's end, touchmove is
cancelled (`N()`, non-passive wheel/touchmove), the page is pinned with `scrollTo` (`L`), and a spring (`T`) plays
the nav pill growing into the dark panel. With this change, on touch phones:

- An extra screen of scroll, `div.fw-ms-end` (100lvh, `aria-hidden`), is inserted after #platform.
- #platform is `position: sticky` with `top: calc(100dvh - var(--fw-ms-h))`, so it stays put while that screen
  scrolls in. `--fw-ms-h` is #platform's height plus the sub-pixel gap below it (a ResizeObserver on #platform and
  `main`).
- The morph value p = how far the extra screen has scrolled in, 0..1 (`__msTick`, called from `L`, the scroll
  engine's callback). It is written through `__navMorphSet(p)` (fix-nav-morph's setter: r/x, then `S()`; `b` before
  `x`, so the panel's inert lift comes first).
- The root gets `scroll-snap-type: y proximity` with snap points at p=0 and p=1.
- `__rvPrepNow()` (morph-gpu) runs when the extra screen comes within one screen (IntersectionObserver).
- `N()` and the `scrollTo` pin are skipped under the gate. The page scrolls by itself: no non-passive listener.
- At p <= 0.2 the nav's backdrop test (`z(g, F())`, is-on-dark) runs again in a microtask after the write, because
  `L`'s `_()` ran it before the write (found in the Simulator: a jump back to p=0 left the nav dark-on-light).

The motion changes: the morph follows the finger instead of a 680 ms spring, and the panel can be held half open.

## Checks

### Chrome frozen frames (`frames.mjs`, shared lane, weight probe)

430x932 DPR 3, touch; A = msbasehook held by `__fwMorphSet(m)` at the page end, B = ms scrolled to y0 + m*L (snap off
while positioned), A2 = A again (A/A). m = whole px / 932, 15 positions 0 → 1 → 0.5 → 0.
These runs (`out/morph-scroll/frames-2026-10-04T09-21-16-241Z`, `frames4.log`) used the ms build from before the
p <= 0.2 is-on-dark re-test below; a re-run on ms-9834ccf0a643 is queued (`frames-final.log`). The re-test only
changes the nav's colour class at p <= 0.2, which Chrome already had right.

| | px > 8 shades (device px) | > 128 | max shade |
|---|---|---|---|
| B vs A, every m | 489-501 (1551 at m 0.8 once) | 157-206 | 148-187 |
| A2 vs A (A/A), every m | 195-206 (1256 at m 0.8 once) | 0 | 76-95 |
| rest only, second run: B vs A / A2 vs A | 356 / 364 | 42 / 103 | 144 / 160 |

The extra over A/A is the EN language pill text at the top right (x about 360-390, y 33-42 CSS px); everything
else is within the A/A pattern, including the mid-morph blur. In the second run the A/A itself reached the same
level, so it reads as per-load variance in that label. OBSERVED, cause unknown.
Gate (Chrome): mobile `html.fw-ms` on, #platform sticky, panel `inert` false when open; desktop 1440x900 gate off and
`__fwMorphDrive` still a function.

### WebKit (fw-sim, iPhone 15 Pro Max Simulator, iOS 26.5; `simcheck.mjs`, functional session)

Arms B (ms), A (msbasehook), A2 (A again). B runs first; A holds the m that B reached. Diffs leave out the status
bar (top 200 device px). Run `out/morph-scroll/sim-20261004T175019` (build ms-9834ccf0a643); the scroll-step driver
(p 0 → 1 in 0.05 steps, back in 0.1 steps) is part of it.

- Gate on (`html.fw-ms`, coarse pointer, screen 430x932, innerHeight 775 with Safari's toolbar shown, lvh 815).
- Scroll-step driver, 31 steps (0 → 1 by 0.05, back by 0.1):
  - #platform's bottom stays at 774.58-774.59 (the visual bottom) at every step.
  - The nav's `--morph` equals p at every step (whole-px scroll, e.g. 0.0491 at 0.05). `is-morphing` is set from p > 0, `is-expanded` from 0.95.
  - The panel is never `inert` while open.
  - Programmatic scrolls only: the toolbar never collapsed (dvh stayed 775), so the dvh path under a collapsing toolbar is untested.
- `__rvPrepNow` was called once on the way down (wrapped counter).
- Frames, B vs A (A2 vs A for scale), device px:

| m | B vs A: px > 8 / > 64 / > 128, max | A2 vs A: same |
|---|---|---|
| 0 | 29,883 / 344 / 0, 77 (see below) | 0 / 0 / 0, 0 |
| 0.25 | 0 / 0 / 0, 0 | 0 / 0 / 0, 0 |
| 0.5 | 2,966 / 0 / 0, 19 | 3,501 / 0 / 0, 21 |
| 0.75 | 6,758 / 2,989 / 1,170, 177 | 7,012 / 2,880 / 1,184, 189 |
| 1 | 3,524 / 3,009 / 2,661, 224 | 3,516 / 3,019 / 2,673, 224 |
| before the end (y0 - 400) | 19,020 / 58 / 0, 78 | 0 / 0 / 0, 0 |
| p 0 again after the snap checks | 29,882 / 344 / 0, 77 | |

At 0.5-1 every difference, in B and in the A/A alike, is inside the panel's countdown (device x 780-1122,
y 830-1450): it keeps counting between loads. Outside it, B equals A.

**#platform draws differently in Safari wherever it is on screen (T3).**
- At p 0 (the closed rest at the end), B vs A: 29,883 device px over 8 shades (0.89 % of the screen below the status bar), 344 over 64, max shade 77. Only #platform's text and edges differ. A/A: 0.
- Before the end (y0 - 400, #platform on screen but not held): 19,020 px (0.57 %), max shade 78. A/A: 0.
- The text sits about 1 device px (1/3 CSS px) higher in B.
- #platform's box is the same in A and B to 1/64 px: `getBoundingClientRect` top is -1104.90625 at p 0 in both. Nudging the sticky top by ±1/64 px changes no pixel (`simk0.mjs`, `out/morph-scroll/simk0-run1.log`).
- Cause, source part CONFIRMED: WebKit gives every `position: sticky` box its own composited layer when the page scrolls asynchronously, stuck or not. Source: WebKit main `Source/WebCore/rendering/RenderLayerCompositor.cpp`, `requiresCompositingForPosition` lines 4158-4190 and `isAsyncScrollableStickyLayer` lines 4292-4317 (file last changed in ee36cd61e57b, 2026-10-02).
- That this layer is what moves the text by a device pixel is OBSERVED, cause unknown: in our setup the box geometry is identical.
- Chrome shows no such offset (frames above).
- Under the wide rule (fill 64, edge 128, 0.5 %), the shades pass (edges only, max 78) but the share does not, so this is T3.
- Not fixed, because the obvious fixes break something else:
  - Sticky only once p > 0 keeps the rest exact. But on iOS the page scrolls on another thread before the scroll callback runs, so in the first frame(s) of the morph #platform would move up with the finger and then jump back. That is worse than a 1/3 px shift.
  - Sticky from one screen before the end limits the change to the last screen, but the rest at the end stays T3.

### Snap (WebKit and the spec)

- Proximity is UA-defined in the spec: "the scroll container may snap … at the discretion of the UA" (CSS Scroll Snap
  1, `scroll-snap-type: proximity`, https://drafts.csswg.org/css-scroll-snap-1/). The spec also says programmatic
  scrolls such as `scrollTo()` are snapped.
- WebKit snaps to a proximity point only within 0.3 x the scrollport of it: `ratioOfScrollPortAxisLengthToBeConsidered
  ForProximity = 0.3` (WebKit main, `Source/WebCore/page/scrolling/ScrollSnapOffsetsInfo.cpp` lines 218-225; file last
  changed in ff1e94f74356, 2026-07-31). CONFIRMED (source). With a 775 px scrollport that is 232 px, i.e. p below about
  0.28 or above about 0.72 here.
- So a rest between about p 0.3 and 0.7 does not snap: the panel can stay half open (CONFIRMED by the source; seen in
  the Simulator for programmatic scrolls at p 0.3, 0.45, 0.7).
- Programmatic scrolls did not snap even inside the range: p 0.1 stayed at 0.0994, instant and smooth. 0.9 went to 1,
  which the end of the scroll range explains as well. Whether WebKit snaps after `scrollTo` at all: UNRESOLVED, and it
  does not matter for the finger case. Decisive check: a G (WDA gesture) or F run that ends a swipe at p 0.1 and 0.9.

## Platform claims and their status

| claim | status |
|---|---|
| WebKit proximity snap range 0.3 x scrollport | CONFIRMED, WebKit source above |
| A rest at p 0.3-0.7 is possible (half-open panel) | CONFIRMED by the source; a design consequence |
| WebKit snaps programmatic scrolls | UNRESOLVED (none seen in the Simulator; spec says it should) |
| WebKit composites every sticky box in an async-scrolled page, stuck or not | CONFIRMED, WebKit source above |
| That layer is why #platform's text moves by 1 device px | OBSERVED, cause unknown |
| `100dvh` sticky top holds #platform at the visual bottom while Safari's toolbar collapses mid-scroll | UNRESOLVED: only the toolbar-shown state was checked; decisive: G/F run with the toolbar collapsing |
| The scroll engine calls `L` every frame during a finger scroll on iOS | UNRESOLVED: decisive: a G run logging p per rAF |
| Touch scroll is never blocked under the gate (no non-passive listener) | by the code (N() returns at once under the gate); OBSERVED in Chrome only |

## Pixel tiers

- Chrome: within the A/A pattern at every m, except the EN label above. That label is per-load variance in our data, so it reads as T1/T2.
- Safari (Simulator):
  - While the panel covers #platform (m 0.25 to 1): within the A/A pattern.
  - Wherever #platform shows (the closed rest at the end and the screen before it): T3. That is 0.57-0.89 % of the screen, edges only, max shade 78; the sticky layer is explained above.
- The motion is new (scroll-following instead of a 680 ms spring) and a half-open rest is possible, so this is a
  proposal, not an illusion fix (memory: illusions must be pixel-identical).

## Gain

Not measured. What the change removes on phones: the non-passive touchmove (cancelled touch moves), the per-frame
`scrollTo` pin, and the spring's rAF loop. The finger now scrolls the page throughout. Any smoothness or perception
gain needs a phone ticket (timing is deferred) and the user's swipe A/B.

## Risks, conflicts, follow-ups

- **Half-open rest** (above). Follow-up option if the user wants it: a small settle on touchend/scroll end that
  scrolls to the nearer end when 0 < p < 1 (`scrollend` support in Safari would need checking).
- **A composited #platform for the whole page life on iOS:** the sticky box is a layer of its own, about 430 x 1880
  CSS px, so about 1290 x 5640 device px, tiled. Its memory and compositing cost is not measured.
- **Page height** grows by one screen on phones; anything that measures "the end of the page" sees the new end.
- **Coupling with fix-nav-morph:** the setter and the gate are fix-nav-morph's design, applied in this overlay copy
  for the proposal only (its go-ahead). If accepted, the lead makes it a conflict cluster with nav-morph and this is
  rebuilt on top of nav-morph's landed F3.
- **Coupling with nav-hit-cache** (fix-nav-morph, not landed): it caches the is-on-dark answer in `__nsG` and writes
  it every frame, so this change's microtask `z(g, F())` would be overwritten one frame later. A combined build must
  also set `__nsForce = !0` (or `__nsG = F()`) there (fix-nav-morph, 2026-10-04).
- **Coupling with morph-gpu:** built on rev 2 A with `__rvPP = !1` plus `__rvPrepNow`; a new morph-gpu revision means
  a rebuild (build.mjs).
- **Not run:** finger/G driver, toolbar collapse, reduced motion in WebKit, iPad, rubber band at the page end, reload
  while scrolled into the extra screen.

## Files

`build.mjs` (snapshots + delta), `delta.diff`, `prepnow.diff` (copy of morph-gpu a02f2b97 rev2/prepnow.diff),
`patch.diff`, `frames.mjs` (Chrome frames), `simcheck.mjs` / `simk0.mjs` / `simcheck.sh` (Simulator), `proposal.json`.
