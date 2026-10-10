# reveal-paint: why g0.0l's people-card reveal frame paints, and g0.0m

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). The
> records under `out/` stay local; the build itself is `fixes/g0-0m/`.

**Owner:** fix-reveal-paint (2026-10-09). **Asked by:** the lead for user T-265: P-174 passed g0.0l with a disclosed cost.
On the phone, its reveal frame is 44-60 ms, against 35-47 ms on g0.0k. Paint is up 6-9 ms and Composite up 6-12 ms.
**Build:** `fixes/g0-0m/` (g0.0m rev 3 = g0.0l + this change, touch screens only: the CSS that pre-paints the card, and
CSS + JS that keep the hidden card's taps, AX tree and focus order as in g0.0l).
**Stage:** R, I, D signed by the lead 2026-10-09 (5 rulings, answered below); F gates done (`fixes/g0-0m/README.md`);
V: P-175 PASSED on the iPhone 2026-10-10 (reveal frame R7 FLICK 50 -> 30.5 ms, APPROACH 48 -> 28 ms;
D1 PASS; `fixes/g0-0m/README.md` "P-175 result").

Unless a section says Chrome, every number below comes from the iOS 26 Simulator (Safari, 430x775), the P-174 flick
shape and the LayerTree + Timeline probes in this folder. The verdict rests on counts, areas and MB. Simulator ms are
descriptive only (F-084).

## R: what the reveal frame does on g0.0l

`rp-sim.mjs` loads each arm on its own server and checks the served hashes. It then runs a WDA flick (or a step driver
that holds the flip at a chosen y) and records:
- a LayerTree census before and after the flick (paint counts per layer and MB);
- Timeline Paint, Composite, Layout and Style records with their clip boxes, from 20 frames before the flip to 10 after.

On g0.0l, the hidden card is `.start-selling-future:not(.is-visible) > .start-selling-future-card`, with `visibility:
hidden`, opacity 0, blur 14 px and translateY 48 px. Its layers, the deck's two shells in view and their photos have
no backing store until the class flips. The flip frame therefore:
- allocates about 41 MB (step driver at 0.70-0.73: 24.8 -> 65.9 MB; on a flick from the top 12.7 -> 81.7 MB);
- paints 10-20 rects over 1.2-1.6 Mpx2 (paint 4.3-8.4 ms, composite 70-80 ms in the Simulator).

That matches P-174's phone Timeline: Paint +6-9 ms and Composite +6-12 ms in the reveal frame against g0.0k. g0.0k had
lazy photos, so its reveal frame had little to paint. g0.0l preloads and decodes them, so its reveal frame paints all
of them at once.

Knock-outs. Each is CSS injected after load and checked by computed style. Same control g0.0l, JS 4106679e0a8a / CSS
440582cec781.

| arm | changes | flip frame | MB at the flip |
|---|---|---|---|
| L+K | no reveal (card shown, no transition) | no flip | 42.4 -> 42.0 |
| L+S | showcase visible | allocates at the flip | 34.6 -> 81.7 (flick) |
| L+V | card `visibility: visible !important` | allocates at the flip (no will-change opacity) | 12.7 -> 81.7 (flick) |
| L+I (step 0.70-0.73) | transitions off, flip held at y 598-624 | 20 rects, 1.19 Mpx2, paint 3.8 ms | 24.8 -> 65.9 |
| L+I (step 0.60-0.63) | the same, below the threshold | no flip, no allocation | 24.8 -> 24.4 |
| L+I+W | + visible + `will-change: opacity` | 14 rects, 0.63 Mpx2, paint 1.2 ms | 65.4 -> 65.6 (painted before) |
| L+I+W+F | + filter held equal | 22 rects, 0.71 Mpx2, 2.1 ms | 65.8 -> 66.0 |
| L+I+W+T | + transform held equal | 7 rects, 0.60 Mpx2, 0.5 ms | 65.7 -> 65.7 |

So the cost follows the class flip, not the y (decoupling: the same step driver below the threshold gives no flip and
no allocation). The positive knock-out needs both halves: visibility visible and opacity in will-change (W). V alone
still allocates at the flip.

## R (T-265 #6): which static images repaint, and why

Lead's question: at rest, on slow drags and on fast flicks of g0.0l, which static images in the people section repaint?
Probe: `rp-repaint.mjs` (phases rest / slow / fast), read with `rp-repaint-read.mjs` and `rp-waves.mjs`.
- **At rest and on slow drags:** the only repaints in #people are the avatar carousel's own image layers.
- **On a fast flick:**
  - the reveal paints the card and the deck (above);
  - in some flicks, the deck photos of shell 0 or 1 repaint again 1.2-2.8 s after the reveal with the same content
    (`rp-wave-count.mjs`: a photo paint >= 1000 ms after the flip, not within 100 ms of a #people mutation);
  - this late wave came in 1 of 5 g0.0l flicks (r2, r3, r5 x2, r6).
- **The async-decode reading is not the cause.** That reading: the first draw is asynchronous, nothing is drawn, and
  the image repaints when decoding completes. The code path is CONFIRMED in WebKit source (map-reveal-decode,
  safari-7624.5.1.11-branch: `RenderBoxModelObject.cpp` 318-338, `BitmapImageSource.cpp` 398-444,
  `RenderElement.cpp` 1705-1720, `RenderImage.cpp` 312-345). The decisive check is the `decoding="sync"` knock-out
  (L+Y). It had the wave in 3 of 5 flicks (r4 x2, r5, r6 x2), so sync decode does not remove it.
- **Cause: UNRESOLVED.** No mutation in #people and no layer-tree change coincides with the wave. It is intermittent,
  invisible in screenshots and costs about 0.5 ms of Simulator paint. g0.0m is not judged on it.

## I: the mechanism in WebKit

**CONFIRMED on the device branch** (the D card was signed on WebKit main 8f0a69f19a28; once gh worked again, I-261, the
same functions were read on `safari-7624.5.1.11-branch`, commit 26695efdefc6; the phone's iOS 26.x is in the 7624
family, gpu-compositor-playbook.md line 184). Lines are
the device branch's, main's in brackets:
- `RenderLayer::computeHasVisibleContent` (RenderLayer.cpp 2021-2050 [2072-2081]): a layer whose renderer has
  `visibility` other than visible has no visible content (unless a non-layer child is visible).
- RenderLayerBacking.cpp:
  - `setContentsVisible(m_owningLayer.hasVisibleContent() || hasVisibleNonCompositedDescendants())` (1841 [2025]);
  - `determinePaintsContent` scans descendants only with visible content (3152-3155 [3691]);
  - `updateDrawsContent` (2026 [2311-2314]) decides backing store from the painted-content check.
- `containsPaintedContent` returns false while `!Styleable::mayHaveNonZeroOpacity()` (RenderLayerBacking.cpp
  3321-3332 [3880-3891]). That function is true for a non-zero opacity, for `will-change: opacity`, or for a running
  opacity effect (Styleable.cpp 211-225 [224-238]). So an opacity-0 layer gets a backing store only if will-change
  names opacity.
- `RenderElement::adjustStyleDifference` (RenderElement.cpp 305-341 [320-339]): a transform, opacity or (unless the
  layer paints its filters) filter change on a composited layer is RecompositeLayer, not a repaint.
- `Source/WebCore/style/StyleDifference.cpp` (identical on both): a visibility change is a Repaint difference (836); a
  pointer-events change is RecompositeLayer (907); an `effectiveInert` change is a Repaint difference (776-778, used at
  865), which is why inert cannot be toggled at the reveal (rev 3 below).

## D: what g0.0m does, and what it moves

g0.0m (touch screens only, the media query of g0.0l's photo preload) has two rules:
- the hidden card is `visibility: visible`, still at opacity 0, blur 14 px and translateY 48 px;
- the card's `will-change` gains opacity.

WebKit then paints the card's and the deck's layers before the reveal, as soon as they enter the layer coverage rect.
The flip itself changes only opacity, filter and transform on the composited card.

Simulator flicks (`rp-sim.mjs`, P-174's flick shape, sessions s6-s10, `rp-flick-table.mjs`). Medians, with each arm
at n=5 or n=4. One g0.0l run is void: the first flick after the WDA start did not scroll.

| arm | flip rects | flip kpx2 | flip paint ms | flip comp ms | 10 frames before: kpx2 / paint ms / max comp | 10 after: kpx2 / paint ms / max comp | MB at top -> after |
|---|---|---|---|---|---|---|---|
| g0.0l (n 5) | 10 | 1559 | 5.6 | 72.9 | 472 / 1.5 / 12.9 | 3122 / 8.5 / 101.5 | 12.7 -> 81.7 |
| g0.0m (n 5) | 13 | 972 | 0.7 | 26.8 | 2584 / 9.7 / 52.9 | 2883 / 5.1 / 105.6 | 34.3 -> 81.7 |
| g0.0m + shell layer hold X (n 4) | 13 | 1167 | 5.4 | 51.0 | 1587 / 3.9 / 48.4 | 3275 / 5.4 / 118.8 | 12.5 -> 81.7 |

- **What g0.0m does in the Simulator:**
  - the flip frame's paint area drops by a third and its paint ms by ~85 %;
  - the big deck paints (two 344 kpx2 shells, one 396 kpx2 layer) move into the 1-3 frames before the flip, while
    the card enters the coverage rect during the flick;
  - about 22 MB is already painted at load (12.7 -> 34.3 MB at the top);
  - the total paint over the 21 frames is the same (L 15.6 ms, M 15.5 ms).
- **So g0.0m spreads the reveal's paint; it does not remove it.** The worst frame near the flip in the Simulator moves
  from the flip frame (73 ms comp) to a frame before it (~53 ms). Whether that lowers the phone's frames > 50 is the
  phone check's question; the Simulator cannot answer it.
- **X stays out.** X held `will-change: transform` on the out-of-window shells while hidden. It kept the flip frame's
  paint (5.4 ms) and made it worse than g0.0m.
- **Memory:** g0.0m holds ~22 MB more from load onward, which g0.0l allocates at the flip anyway. After the flick both
  arms are at 81.7 MB.

## Lead ruling 2: memory and idle paint at the top (rev 3)

`rp-idle.mjs` on sessions i4-i7 (n 3 per arm; table in `fixes/g0-0m/README.md` gate 5):
- g0.0m holds +21.8 MB whenever the card is hidden: 34.4 vs 12.6 MB at the top after load, 34.3 vs 14.0 back at the top
  after a visit. From the reveal on, both are equal (96.2 MB at y 1400, 84.1 at y 4000), with the same layer count.
- In 30 s of idle at the top, both arms make the same number of Timeline paints (1343 vs 1346; the hero's animation
  dominates). #people painted its active shell 2 times in 1 of 3 g0.0m loads, never on g0.0l.
- The heat effect of either is untested.

## Decisive check (2): blank photo boxes in the first frames after the reveal

`rp-frames.mjs` records the Simulator screen during P-174's flick shape: 6 loads, 2 flicks each, frames ~16 ms apart.
That is the deck-recording exception (memory deck-recording-pictures, out/people-blink/rp-v1). Two readers:
- `rp-video-blank.py`: per reveal, the first frame with the deck drawn, and how long the web view is blank (std < 4);
- `rp-video-strip.py`: the frames around the flip as one picture.

I checked strips of four reveals by eye. Results:
- **No undrawn photo boxes in either arm.** No frame shows the card with its photo boxes undrawn: the screen goes from
  the hero to the fully drawn card.
- **The deck appears sooner on g0.0m:**

| | g0.0l (n 5 valid) | g0.0m (n 6) |
|---|---|---|
| first frame with the deck drawn, ms after the flip | 97-298, median 127 | 68-115, median 92 |
| reveals with white web-view frames | 3 of 5 (28-58 ms) | 2 of 6 (25-30 ms, one load) |

- **The white frames.** On g0.0l, L3's second flick shows a fully white screen for ~45 ms before the card. On g0.0m,
  the white frames come partly from the hero's own fade.
- The first g0.0l load's first flick had no flip and is left out.

Simulator only; the phone composites on another path.

## Behaviour and a11y: g0.0m rev 2 and rev 3

The Chrome probe `rp-dom.mjs` (mobile with touch, headless; C = g0.0l, V = g0.0m) reads the hidden card at y 0, 300
and 600, the shown card at 1400, then 600 and 0 again (hidden again). Per stop: the hit grid in #people, the focusable
elements that render, the not-ignored accessibility nodes in #people (with role and element), and the card's
descendants that can take a tap (visibility visible and pointer-events not none).

- **Rev 1** (visibility visible only): the people faces (`.start-selling-future-people-o-face`, `pointer-events: auto`
  under `.is-expanded`) took 15-20 hit-grid points while invisible.
- **Rev 2** (CSS b04a7f5c367a) set `pointer-events: none !important` on every descendant of the hidden card. Taps were
  fixed, but AT and focus were not: while hidden, not-ignored AX nodes 14 -> 83 and focusables 6 -> 25-31.
- **Lead ruling 3: try inert.** Knock-out N (inert on the hidden card, cleared at the flip) repaints both deck shells
  in the flip frame, 2 of 2 (flip area 1581-1590 kpx2 against 1017-1025 for Z and M; sessions s12/s13). The source
  says the same: an `effectiveInert` change is a Repaint difference (StyleDifference.cpp 776-778, used at 865), and
  the "neither style paints" early-out (643-650, 833) is per element, so the card's opacity 0 does not cover its
  descendants. So inert is out. Knock-out Z (aria-hidden on the card + tabindex -1 on its focusables) kept the flip
  frame as M (1017-1025 kpx2, no shell rect).
- **What g0.0l really hides.** Building Z into the page showed that g0.0l does NOT hide everything in the card: the
  profile tabs (`.start-selling-profile-tabs`) set their own visibility (hidden by default; visible on phones and with
  `.is-rail-in`, CSS lines 3264-3290, 3730-3736, 3966-3968), so while the card is hidden on a phone, g0.0l keeps the 6
  tabs focusable, in the AX tree (region > tablist > tab) and tappable. The card-wide aria-hidden of the first rev 3
  build (JS 5771a6c5acd8) hid them too (focusables 6 -> 0, AX 14 -> 1), and rev 2's descendant rule blocked their taps.
- **Rev 3** (JS 37af49aef32b, CSS 7a8ecdd8f8e4), touch screens only, mirrors g0.0l's hidden set exactly:
  - CSS: `pointer-events: none !important` on the hidden card's descendants except the tabs subtree
    (`*:not(.start-selling-profile-tabs, .start-selling-profile-tabs *)`);
  - JS, at every hide: aria-hidden on the highest elements that do not contain the tabs, tabindex -1 on their
    focusables, and role none with the name removed on the containers around the tabs (card, showcase,
    `section#profile-showcase`, sticky, chrome; the section carries an aria-label, which would keep it a region);
    each element's own aria-hidden / tabindex / role / name is kept and put back at the flip;
  - a MutationObserver covers nodes added while hidden, tabs arriving inside a hidden branch, and tabindex / href /
    role / name changes the app makes while hidden (the section's aria-label is reactive: language switch);
  - no selector in the page CSS or in WebKit's UA sheet (html.css, device branch) reads aria-*, role or tabindex, and
    WebKit invalidates style on an attribute change only for attribute names in rules
    (`AttributeChangeInvalidation.cpp` 38-80), so these writes restyle and repaint nothing.
- **Rev 3 result** (`dom-rev3e.log`, 2026-10-09 13:20Z):

| y | focusables C / V | AX not ignored C / V | AX lists | tappable in card C / V | hit grid in #people |
|---|---|---|---|---|---|
| 0, 300, 600 (hidden) | 6 / 6 | 14 / 14 | identical | 13 / 13, identical | equal (0 / 315 / 630 points) |
| 1400 (shown) | 25 / 25 | 83 / 83 | identical | 338 / 338, identical | 863 / 863 |
| 600, 0 (hidden again) | 6 / 6 | 14 / 14 | identical | 13 / 13, identical | equal |

  The only differing hit points lie in the hero (`h1` vs `.hero-copy-main`, accent phase) and one at 1400 on a
  spinning record label (`img.label-img` vs `span.record`): animation phase, outside the change. At 1400 every
  attribute is back (aria-hidden count 31 / 31, tabindex -1 0 / 0).
- **Residuals (disclosed):** find-in-page can match the hidden card's text (visibility: hidden excluded it in g0.0l);
  the AX check runs in Chrome, VoiceOver itself was not run.

## Probes in this folder

| file | what |
|---|---|
| `rp-sim.mjs` / `rp-read.mjs` / `rp-flick-table.mjs` | flip-frame census and knock-outs; reader; L vs M table |
| `rp-repaint.mjs` / `rp-repaint-read.mjs` / `rp-waves.mjs` / `rp-wave-count.mjs` | T-265 #6 repaint trace (rest, slow, fast); late-wave count |
| `rp-frames.mjs` / `rp-video-blank.py` / `rp-video-strip.py` / `rp-video-read.py` | decisive check (2): Simulator screen video of the flick, L vs M (copy of people-blink's pb-frames.mjs); blank and deck-drawn frames; strips; pb-analyze events over the card |
| `rp-dom.mjs` | build card: a11y / focus / hit-test / tappable difference of the hidden and shown card, with the AX role:element lists (Chrome) |
| `rp-idle.mjs` | lead ruling 2: 30 s idle census at the top (MB, Timeline paints, layers painted in and outside #people) and the visit census (MB at y 1400 / 4000 / back at 0), from `rp-sim.mjs` records with `RP_DRIVE=none RP_IDLE_MS=30000 RP_VISIT=1400,4000,0` |
