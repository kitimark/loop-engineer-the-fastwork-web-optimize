# Fix: morph-scroll (PROPOSAL)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** proposal build, **rev 4** (PR-018 rev 4, 2026-10-04; rev 3 was rev 2's build with corrected text). Rev 4
answers the user's rev 3 review: no CSS scroll snap (it cost momentum on the whole page), and a settle to the nearer
end when the page rests part open; see "Rev 4". Proposal history: rev 2 (PR-018; motion change, so a user decision;
lead ruling T-082 #5 item 1). Rev 2 (lead, 2026-10-04): rebuilt on the best build without morph-gpu rev 2 A and `__rvPrepNow`, because
P-098 measured rev 2 A slower on the phone (first open +6.5 ms). The base is v7 (best build since c3dc73b1; the lead
confirmed v7 over plain B-R2). Before it can join a best build, B must also pass the whole-page fast-flick G check
(user T-113 #4); phone slot via the lead.
**Stage:** F (proposal). Stage B (a CSS scroll-driven animation) is out while it is UNRESOLVED.
**Device class / gate:** touch phones only: not reduced motion, `(hover: none) and (pointer: coarse)`, and the short
screen side at most 600 px. Desktop, tablets and reduced motion keep today's jack (checked in Chrome at 1440x900, rev 1).
**Driver(s) behind the claims:** Chrome frozen frames (430x932 DPR 3, touch) and Simulator functional sessions
(scripted `scrollTo`, frozen frames). No G or F driver yet: touch, snap and toolbar effects need one before landing.
**Owner:** fix-hero-exit-threaded. Coupled to fix-nav-morph (setter and gate, its go-ahead for this proposal build).

## Builds (rev 4)

| name | what | JS / CSS (sha256, 12) | snapshot |
|---|---|---|---|
| msbase (Try-it A) | best build v7: `fixes/v7-best/patch.diff` | 8c90da217745 / 308f0da70c3a | `out/snapshots/msbase-8c90da217745` |
| msbasehook | msbase + `window.__fwMorphSet(m)` (morph-gpu's frozen-frame hook, byte for byte) | 230ccb4b859a / 308f0da70c3a | control for every frame below |
| ms rev 4 (Try-it B) | msbase + this change (`delta.diff`, 149 lines, 8a8847a9517a) | 5372c2d68c7d / c4a4af0a7d6a | `out/snapshots/ms-5372c2d68c7d` |
| ms rev 2/3 (history) | the same with root `scroll-snap-type: y proximity`, no settle | d661831b8797 / cff335191762 | `out/snapshots/ms-d661831b8797` |

`node fixes/morph-scroll/build.mjs [--base v7|br2] [--seed <abs JS diff>]` rebuilds the three snapshots from the base
patch (sha-checked) and writes `delta.diff` (the proposal against msbase). `--seed` rewrites the overlay as base + that
JS diff + `ms.css` (the CSS block) appended. `patch.diff` is the whole stack against the baseline
(`node tools/fix.mjs diff morph-scroll`, rev 4: 0194e95999f5). Rev 1 (on B-R2 + morph-gpu rev 2 A + `__rvPrepNow`, ms
9834ccf0a643 / b829d8e7ae29) is in git history (93d97dad); `prepnow.diff` is kept only as rev 1's record.

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
- Rev 4: no CSS scroll snap. Instead a settle: passive window touchstart/touchend/touchcancel track whether a finger
  is down; `__msTick` records the last scroll direction and, while no finger is down, re-arms a 200 ms timer on every
  scroll frame. When it fires (the page has rested 200 ms, finger up) and 0.002 < p < 0.998, `__msSettle` smooth-scrolls
  to open (p=1) or closed (p=0): open when p >= 0.3 after an opening move, p >= 0.7 after a closing move, p >= 0.5 with
  no direction. So a small pull back from open returns to open, a pull past 30 % opens, and nothing settles while the
  finger holds the panel. (Rev 2/3 had root `scroll-snap-type: y proximity` with snap points at p=0 and p=1.)
- `N()` and the `scrollTo` pin are skipped under the gate. The page scrolls by itself: no non-passive listener.
- At p <= 0.2 the nav's backdrop test (`z(g, F())`, is-on-dark) runs again in a microtask after the write, because
  `L`'s `_()` ran it before the write (found in the Simulator: a jump back to p=0 left the nav dark-on-light).

The motion changes: the morph follows the finger instead of a 680 ms spring, and the panel can be held half open.

## Checks

### Rev 4 (ms-5372c2d68c7d; 2026-10-04 ~13:30Z)

Rev 2/3's momentum was never measured before the user's review; rev 4's is (G driver, below).

Mechanism checks, shared lane, no timing (`settle-checks.sh` = `settle-sim.mjs` + `settle-chrome.mjs`; output
`out/morph-scroll/settle-sim-2026-10-04T13-31-32-431Z.json`, `settle-chrome-2026-10-04T13-32-42-676Z.json`):

- Simulator (fw-sim, iPhone 15 Pro Max, scripted `scrollTo`): rev 4 root and body `scroll-snap-type: none` (rev 3:
  root `y`). The 6 `scroll-snap-align` boxes left are the page's own profile carousel (nested scroller, in the base too).
- Simulator, rest at p after a jump from p0 (sampled 100 ms to 2 s); a mid-page rest never moved in either build:

  | p0 -> rest p | expected | rev 4 after 2 s (settled by) | rev 3 after 2 s |
  |---|---|---|---|
  | 0 -> 0.40 | open | 1 (500 ms) | 0.4, stuck |
  | 0 -> 0.20 | closed | 0 (500 ms) | 0.2, stuck |
  | 1 -> 0.60 | closed | 0 (500 ms) | 0.6, stuck |
  | 1 -> 0.80 | open | 1 (500 ms) | 1 |
  | 0.3 -> 0.50 | open | 1 (500 ms) | 0.5, stuck |
  | 0.7 -> 0.50 | closed | 0 (250 ms) | 0.5, stuck |

- Chrome 430x932 DPR 3, CDP touch drags (no fling), finger held still 1.2 s, then lifted: 4/4 OK. While the finger is
  down p does not move (0.433, 0.134, 0.567, 0.866 held); after lift-off it settles by 500-1000 ms: 0.433 -> 1,
  0.134 -> 0, 0.567 -> 0, 0.866 -> 1. A mid-page drag never moves after lift-off.

G driver on the iPhone (WDA robot finger, iPhone 15 Pro Max, iOS 26.6.1 Safari, plain http, 2026-10-04 13:51-14:01Z;
script `g-momentum-v1.json` hash 658e195e77fa, runs R4 V7 R3 R3 V7 R4 by `g-momentum-run.sh`, numbers by
`g-momentum-analyze.mjs`; records `out/morph-scroll/g/`, `analysis.json`). Not a timed block: no sentinel, no thermal
gate; the frame counts below are context, not a gain claim.

- Mid page (y ~2000-3300, far from the end screen), the same 200 px / 140 ms fling (lift-off ~2.4 px/ms finger speed),
  3 up + 3 down per run, 2 runs per arm; glide = scroll after lift-off until the page holds still 300 ms. Medians:

  | arm | n | glide up | glide down | frames > 34 / > 50 ms inside the glides |
  |---|---|---|---|---|
  | V7 (A) | 6+6 | 1058 px, 2.66 s | 1077 px, 2.67 s | 16 / 2 |
  | rev 4 | 6+6 | 1087 px, 2.67 s | 1174 px, 2.66 s | 18 / 2 |
  | rev 2/3 (root snap) | 6+6 | 299 px, 0.70 s | 164 px, 0.47 s | 0 / 0 (shorter glides) |

  Rev 3 lost 72-85 % of the glide: the fast deceleration the WebKit source predicts (CONFIRMED above, now also
  measured). Rev 4's glide is within V7's spread (V7 1016-1285 px, rev 4 1007-1292 px).
- End of page, slow drags (no fling) held still 1.5 s on the glass, then lifted; p before lift -> p at rest:

  | stroke | rev 4 (2 runs) | rev 2/3 (2 runs) |
  |---|---|---|
  | E1 close from open by ~0.55, hold | 0.41 -> 0 (closed), 0.52-0.53 s | 0.37 -> 0.45, stuck half open |
  | E2 open from there by ~0.55, hold | 0.59 -> 1 (open), 0.54-0.55 s | 1 -> 0.96 |
  | E3 small pull back from open, hold | 0.78 -> 1 (back to open), 0.52-0.53 s | 0.74 -> 0.96 |
  | E4 fling down out of the open screen | 0.81 -> glides past closed (-0.48/-0.65, 2.7 s) | 0.76 -> 0.56, stopped half open |

  The settle runs only after lift-off (held 1.5 s without moving in every rev 4 case). V7 has no end screen (its rows
  are not meaningful); V7 run 5 aborted at the end approach (`until atEnd` not reached in 4 s), so its flicks count and
  its end strokes do not. p uses the frame's own innerHeight (Safari's toolbar moves the end of the scroll range).

### Rev 2 (ms-d661831b8797 vs msbasehook-230ccb4b859a, 2026-10-04 ~12:30Z)

Simulator (`out/morph-scroll/sim-rev2/`, `sim-rev2.log`): the same result as rev 1.
- The scroll-step driver ran 31 steps. #platform's bottom stayed at 774.58-774.59 at every step, `--morph` = p, and the panel was never `inert`.
- No prep call (`prep: null`, as intended).

| m | B vs A: px > 8 / > 64 / > 128, max | A2 vs A |
|---|---|---|
| 0 | 29,884 / 344 / 0, 77 (T3, below) | 0 |
| 0.25 | 0 | 0 |
| 0.5 | 782 / 0 / 0, 15 | 1,408 / 0 / 0, 13 |
| 0.75 | 4,703 / 2,133 / 945, 191 | 5,435 / 2,518 / 1,067, 191 |
| 1 | 2,519 / 2,224 / 1,975, 224 | 3,060 / 2,540 / 2,215, 224 |
| before the end | 19,020 / 58 / 0, 78 | 0 |

Chrome frames (`out/morph-scroll/frames-2026-10-04T12-35-52-938Z`, `frames-rev2.log`), 15 positions:
- B vs A: 607-779 device px over 8 shades (0.02 %) and 302-412 over 128 at every m, max shade 149-187.
- A2 vs A: 0-222 over 8, max 17.
- The diff map puts every differing pixel on the EN language label. It sits at x 240-280 CSS at m 0 and moves with the pill to x 360-400 at m 0.7 and 1. The text is drawn about 1 device px apart; nothing else differs.
- In rev 1's second run the same label also differed base vs base. In this run it did not.
- OBSERVED, cause unknown. Over the wide rule's edge shade (128), so Chrome is T3 at that label. That is about 70 CSS px².

### Rev 1 (history): Chrome frozen frames (`frames.mjs`, shared lane, weight probe)

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

### Rev 1 (history): WebKit (fw-sim, iPhone 15 Pro Max Simulator, iOS 26.5; `simcheck.mjs`, functional session)

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

- **User review of rev 3 (2026-10-04, changes requested).** With B on the phone, every flick on the whole page coasted
  much less. The cause is CONFIRMED in WebKit's source (main 63c4e68):
  - `RemoteScrollingCoordinatorProxyIOS::shouldSetScrollViewDecelerationRateFast()` is true as soon as the root
    scrolling node has any snap offsets (RemoteScrollingCoordinatorProxyIOS.mm l.645-648, 676-683);
  - WKWebViewIOS.mm then sets `UIScrollViewDecelerationRateFast` on the page's scroll view.
  - So the root `scroll-snap-type` (with any snap point) costs momentum on the whole page, not only at the end
    (finding posted, pitfall).
- The user also saw the half-open rest (below) and wants the page to decide, open or closed, while the follow-the-finger
  opening stays.
- Rev 4 plan: no root snapping. On scrollend with 0 < p < 1, script settles to the nearer end, taking the last scroll
  direction into account. Check with the G driver (WDA flicks, slow drags, release half open) before the user sees it.

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
| Any root snap offset makes iOS use fast deceleration for the whole page (rev 2/3 momentum loss) | CONFIRMED, WebKit source above; measured on G: rev 3 glide 72-85 % shorter than v7 |
| WebKit proximity snap range 0.3 x scrollport | CONFIRMED, WebKit source above (rev 2/3 only; rev 4 has no snap) |
| A rest at p 0.3-0.7 is possible (half-open panel) | rev 2/3: CONFIRMED by the source, and on G; rev 4: settles (G, Simulator, Chrome) |
| WebKit snaps programmatic scrolls | UNRESOLVED (none seen in the Simulator; spec says it should) |
| WebKit composites every sticky box in an async-scrolled page, stuck or not | CONFIRMED, WebKit source above |
| That layer is why #platform's text moves by 1 device px | OBSERVED, cause unknown |
| `100dvh` sticky top holds #platform at the visual bottom while Safari's toolbar collapses mid-scroll | UNRESOLVED: only the toolbar-shown state was checked; decisive: G/F run with the toolbar collapsing |
| The scroll engine calls `L` every frame during a finger scroll on iOS | UNRESOLVED: decisive: a G run logging p per rAF |
| Touch scroll is never blocked under the gate (no non-passive listener) | by the code (N() returns at once under the gate); OBSERVED in Chrome only |

## Pixel tiers

- Chrome: equal at every m except the EN label. In rev 1 that label varied between loads. In rev 2, base vs base was 0 there, and B differs at every m with max shade 187. So it is T3 on that label, about 70 CSS px², cause unknown.
- Safari (Simulator):
  - While the panel covers #platform (m 0.25 to 1): within the A/A pattern.
  - Wherever #platform shows (the closed rest at the end and the screen before it): T3. That is 0.57-0.89 % of the screen, edges only, max shade 78; the sticky layer is explained above.
- The motion is new (scroll-following instead of a 680 ms spring) and a half-open rest is possible, so this is a
  proposal, not an illusion fix (memory: illusions must be pixel-identical).

## Gain

Rev 4 momentum and settle: see "Checks, Rev 4" (G driver, not a timed block). Smoothness gain: not measured. What the change removes on phones: the non-passive touchmove (cancelled touch moves), the per-frame
`scrollTo` pin, and the spring's rAF loop. The finger now scrolls the page throughout. Any smoothness or perception
gain needs a phone ticket (timing is deferred) and the user's swipe A/B.

## Risks, conflicts, follow-ups

- **Half-open rest:** fixed in rev 4 by the script settle (rev 2/3 could rest at p 0.3-0.7). The settle uses a 200 ms
  timer re-armed by the scroll callback, not `scrollend`. Not checked: touching the screen while the settle glides.
- **A composited #platform for the whole page life on iOS:** the sticky box is a layer of its own, about 430 x 1880
  CSS px, so about 1290 x 5640 device px, tiled. Its memory and compositing cost is not measured.
- **Page height** grows by one screen on phones; anything that measures "the end of the page" sees the new end.
- **Coupling with fix-nav-morph:** the setter and the gate are fix-nav-morph's design, applied in this overlay copy
  for the proposal only (its go-ahead). If accepted, the lead makes it a conflict cluster with nav-morph and this is
  rebuilt on top of nav-morph's landed F3.
- **Coupling with nav-hit-cache** (fix-nav-morph, not landed): it caches the is-on-dark answer in `__nsG` and writes
  it every frame, so this change's microtask `z(g, F())` would be overwritten one frame later. A combined build must
  also set `__nsForce = !0` (or `__nsG = F()`) there (fix-nav-morph, 2026-10-04).
- **Repaint (rev 2), corrected 2026-10-04 from fix-morph-gpu's Simulator counts (F-223, its README "What repaints at
  the open start", e274aef0; OBSERVED, counts only):** the large repaint (~30 rects, ~1.6 Mpx) happens only in the frame
  where m leaves 0 and again where it returns to 0 (~22 rects): #platform's --morph-fade moves its blur/opacity off 1, and
  the earn button's transition. Frames in between repaint 1-15 rects, not the whole panel (the rev 2 text said every
  frame; that was wrong). For this change: each time the finger takes m across 0 (open from closed, or back to closed,
  including a proximity snap to closed) it pays that one frame, so a user who scrolls back and forth around the start of
  the extra screen pays it more often than the spring's one open per visit. Not measured on the phone. If morph-gpu lands
  a revision that is no slower on the phone, this is rebuilt on it (build.mjs).
- **Fast-flick G check** (user T-113 #4): needed before B can join a best build; phone slot via the lead.
- **Not run:** finger/G driver, toolbar collapse, reduced motion in WebKit, iPad, rubber band at the page end, reload
  while scrolled into the extra screen.

## Files

`build.mjs` (snapshots + delta), `ms.css` (the CSS block), `delta.diff`, `prepnow.diff` (rev 1 only; copy of morph-gpu a02f2b97 rev2/prepnow.diff),
`patch.diff`, `frames.mjs` (Chrome frames), `simcheck.mjs` / `simk0.mjs` / `simcheck.sh` (Simulator), `settle-checks.sh` + `settle-sim.mjs` + `settle-chrome.mjs` (rev 4 mechanism checks), `g-momentum-v1.json` + `g-momentum-run.sh` + `g-momentum-analyze.mjs` (rev 4 G proof), `proposal.json`.
