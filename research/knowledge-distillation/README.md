# Why a beautiful page stutters: lessons from optimizing fastwork.com's scroll

2026-10-12. A personal, educational study of the public homepage https://fastwork.com/ on a frozen local copy (one build,
pinned by `baseline.json`). Not affiliated with or endorsed by Fastwork. This is not a criticism of the people who
built the page: it is ambitious design work, and most of what follows is invisible on the machines a web team usually
tests on.

Conventions. "Phone" is an iPhone 15 Pro Max with Safari on iOS 26.6.1. "Chrome 6x" is Chrome at 430x932, DPR 3, touch,
with the CPU slowed 6x. "Simulator" is the iOS Simulator; we used it for counts only. A "slow" frame takes over 34 ms,
which loses at least one 60 Hz picture. A "very slow" frame takes over 50 ms. JS and CSS lines are 1-based lines of the
prettified baseline (`site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`, `.../assets/2.gBuqKVzi.css`). **Every timing
and count in this document is OBSERVED: our own runs, in our setup, usually 2 to 5 runs per arm.** Platform claims
carry the status from the verifier's table (section 6). "Inference" marks a guess, mostly about why the original team
wrote what it wrote; the repo has no record of their process.

## 1. Summary

- **No single thing was slow.** Dozens of effects that are each cheap alone shared the same frames on a 60 Hz phone,
  and removing one usually moved the cost to the next (lessons 1, 30).
- **Mistake families:**
  - (a) script reading and writing layout every scroll frame;
  - (b) animating properties the engine cannot composite (width, grid columns, stroke-dashoffset, background-position,
    SMIL, `steps()`);
  - (c) WebKit-only layout traps (presence flips, sticky elements under the moving iOS toolbar, size containers);
  - (d) layer mistakes (resized composited layers, a layer per digit, layers built in an interaction's first frame,
    full-screen blurs);
  - (e) loops nobody can see;
  - (f) scroll-jacking.
- **Why it happens:** the costs live in an engine and device the team does not develop on. Chrome at 1x (mobile
  emulation) showed 0.0 slow frames per scripted scroll where the phone showed 15.7 (lesson 23). The cost rules differ per engine and are
  not in CSS tutorials, and the usual metrics (fps averages, LoAF) miss the frames a thumb feels.
- **The result:** on the phone, replaying the user's own swipe through the top of the page, slow frames fell from 20.1 %
  to 1.7 % and very slow frames from 10.1 % to 0.22 %. At the end of the page, the longest frame fell from 584 ms to
  42 ms. Above the end of the page the final build keeps the original look. It differs in two places the user chose:
  at the end the menu follows the finger instead of opening by itself, and after a fast flick the People card shows at
  once instead of fading in (section 2, lessons 14, 21).
- **We made the same kinds of mistakes while fixing it:** we trusted Chrome counts, scored scripted scrolls, blamed the
  most visible animation, and let a single probe become "fact". The user's thumb caught what the numbers missed
  (lessons 23-28).
- **Rule 1:** test on the slowest real target (here a 60 Hz iPhone with Safari) from day one, with a real finger gesture,
  warm, and count frames over 34 and 50 ms per scroll zone, not fps averages.
- **Rule 2:** animate only `transform` and `opacity` (and `filter` with care) of layers that already exist, driven by
  CSS or scroll timelines, not by script writing styles every frame.
- **Rule 3:** in a frame that moves, script reads no layout and writes nothing that inherits. Read once, write once,
  and prefer observers to rect reads.
- **Rule 4:** every animation has an owner for "can anyone see this?" and goes to zero work at rest. Test the page
  parked at every scroll position.
- **Rule 5:** price every layer and blur (MB, first-frame cost, Composite time), create layers before the motion starts,
  and never resize a composited or blurred layer in motion.

## 2. The page and what it cost

**What the page does.** One long phone page in "morph design":

- **Hero.** A 200vh track with a sticky 100svh hero. The headline's accent word "you" is a hand-drawn SVG stroke
  that erases and redraws every ~3 s. A rolling digit countdown sits under it. Four cards scatter and fade out as you
  scroll.
- **People.** A full-screen card fades up out of a blur over the leaving hero. The "o" in the title "People still need
  people" opens into a row of faces. A deck of six phone-mock profile cards snaps sideways, and a pill of avatars
  rotates every second.
- **Middle.** Typing and count-up effects, a dark "pain" section, and four platform cards whose titles carry endless
  gradient sweeps, a glint and a spinning vinyl.
- **End of page.** The scroll is held, and the nav pill grows into a full-screen menu over 680 ms. The menu has a photo
  wall, a second countdown and frosted glass.

**What it cost, and where it ended.** Original frozen copy against the final build g0.0m (`fixes/BEST_BUILDS.md`).
Phone runs were at the Serious thermal state set by a tool, robot finger unless noted.

| Moment (driver) | Original | Final (g0.0m; g0.0l where marked) | Source |
|---|---|---|---|
| User's swipe through the top, robot replay, 2 runs pooled | 519 of 2,588 frames slow (20.1 %), 261 very slow (10.1 %), longest 154 ms, ~40 frames/s | 61 of 3,589 slow (1.7 %), 8 very slow (0.22 %), longest 89 ms, ~59 frames/s | article Fig. 14 |
| The user's own finger, one record each (different strokes, no heat state set) | 88 slow, 33 very slow in 15.1 s | 4 slow, 0 very slow in 18.9 s | article Fig. 9 |
| End of page, open/close menu twice, 13 s | 80 slow, 41 very slow, 18 over 100 ms, longest 584 ms | 4, 0, 0, longest 42 ms | article clip 4 |
| Slow drags, top to y ~3,500, 2 runs pooled | 197 of 1,822 slow (10.8 %), longest 361 ms | g0.0l: 9 of 2,178 (0.41 %), longest 64 ms | article Fig. 17 |
| Avatar carousel, page at rest 12 s | 17 and 20 slow | 0 and 0 | article clip 3 |
| Heat, °C/min over a blank page (real heat, 2 sessions) | +0.467 / +0.491 | +0.255 / +0.336 | `research/phone-heat/README.md` P-068b |

**What Chrome said.** The first eight fixes combined (wave 1) took Chrome 6x from 93.8 to 110.6 fps, with
non-overlapping ranges. Frames over 34 ms stayed at 5 per run. On the phone the user's verdict was "Laggy the same"
(`fixes/all-wave1/README.md`; article Day 2). Chrome at 1x saw nothing at all: 0.0 frames over 34 ms per scripted
scroll, against 15.7 on the phone (`research/cpu-throttle-calibration/README.md`).

The work took ten days, 442 agents and about $13,500 at API list prices. The end of the page took the longest road:
- v14 made the menu follow the finger;
- g0.0b (7 Oct) rolled the end back to the original behaviour;
- g0.0k (9 Oct, PR-040) brought the finger-following end back, with a steady glass;
- g0.0m added the pre-painted People card (lessons 14, 21).

## 3. The mistakes, grouped by mechanism

Each lesson gives what the original did, what it cost, why a capable team writes it, what fixed it, what did not, and
the rule.

### A. Script on every frame

**Lesson 1. Read, write, read in the shared scroll callbacks.**
- *Original.* One scroll engine (`rE`/`iE`/`dE`, JS 2663-2780) runs every effect's callback in one rAF. The callbacks
  mix rect reads with style writes, so each read after a write forces a synchronous style and layout pass. The nav's
  hit test probes the page on every frame by writing an inherited property, which restyles its whole subtree twice:
  `T.style.pointerEvents = 'none'; document.elementFromPoint(...); T.style.pointerEvents = r` (JS 12955-12963).
- *Cost.* Chrome 6x: the nav callback ran 316-320 times and 526-617 ms per run; `iE` took ~55 ms over 3 frames
  (`fixes/TOPICS.md`). On the phone, before `fixes/hit-skip`, the control laid out 2.2-2.4 times per morph frame.
- *Why.* Each effect was written as its own component with a sensible rect read and write. The cost is spread over
  20-30 ms frames that LoAF never reports. (Inference.)
- *Fixed by.* `elementsFromPoint()` skipping its own subtree (0/1690 parity mismatches); cached `MediaQueryList` and
  `querySelector` results; writing only on change; skipping reads whose answer cannot show.
- *Did not work.* Removing one reader. Removing the pain section's 333 rect reads cut `iE`'s forced layout from 46-52 to
  4-7 ms, but the next reader rose from 15-20 to 25-30 ms (net -24 ms, within noise; `fixes/FINDINGS.md`). On WebKit,
  gating off-screen callbacks left forced style passes at 230-243 (`fixes/scrollcb-g0`). The nav's `window.scrollY`
  read paid instead: when `scrollY` is not 0, reading it makes WebKit run any pending layout first (CONFIRMED,
  `LocalDOMWindow.cpp` 1508-1512). That costs only when layout is dirty, which in a callback that also writes styles is
  every frame.
- *Rule.* Per frame, all reads first, then all writes, once. Never write an inherited property to probe the DOM. A
  removed read pays only when every reader in that frame is gone.

**Lesson 2. One inherited custom property drives a whole subtree.**
- *Original.* The hero exit (JS 4163-4172) reads `.hero-track`'s rect and writes `--exit-opacity` on `.hero`. CSS turns
  it into opacity, translate and blur on the copy, cards and scroll cue. At the end of the page, a tween writes `--morph`
  on the nav every frame (JS 13021-13036). Both are unregistered, so every write restyles the subtree.
- *Cost.* Hero (~230 elements): a modelled 5-12 ms per frame, mostly style (derived, `research/design-engineering/hero.md`).
- *Why.* One scalar driving everything is the idiomatic CSS-variable pattern, and it is fine at 120 Hz on a fast Mac.
  (Inference.)
- *Tried first.* A CSS `view-timeline` with `animation-range: contain 0% contain 100%`, which equals the JS formula,
  with a JS `@supports` fallback (FINDINGS T12). It removed every JS write in Chrome. On the phone it won at y ~50
  (max-frame median 48 → 35 ms) and lost at y ~700 (51 → 63 ms, disjoint ranges). That was a new WebKit cost, not a
  moved one; one hypothesis is the seven live ViewTimeline animations past the flip, cause UNRESOLVED
  (`postmortem-hero.md` card 1).
- *Shipped.* v6 moved the cards' fade to the compositor, scroll-driven instead of script-written every frame
  (`fixes/hero-exit-threaded`). Slow frames in the hero band went from a median of 27 to 12 per run against v4, but the
  ranges overlap (27, 37, 22 against 26, 8, 12), so the verdict was "no worse". The user picked v6 in both blind swipes.
  On the 11 Oct re-run the medians were 31 (original), 18 (v4) and 7 (v6), with v6 against v4 threshold-sensitive
  (article Fig. 7).
- *Did not work.*
  - Registering `--morph` with `inherits: false` left the nav's children stale on WebKit (`fixes/morph-inherit`).
  - In our setup, Safari 26 keyframes that reference an animated custom property resolved against its base value
    (FINDINGS P3).
- *Rule.* No custom property as a per-frame animation bus. Animate real properties where they are used, and trace the
  target engine at every scroll position, including where the range ends.

**Lesson 3. Script drives effects that CSS switched off, or that no longer exist.**
- *Original.* "Shrink" effects (`--future-shrink`, `--commission-*`) ease 22 % per frame in JS, reading rects, while
  phone CSS forces scale 1 and radius 0 (CSS 916-938). The hero CTA's orbit animates an element that is always
  `display: none` (CSS 1821-1828).
- *Cost.* Gating the shrinks on phones took Chrome 6x from 66.5 to 71.6 fps; phone frames over 20 ms fell from 60-64 to
  40-43 (FINDINGS T1).
- *Why.* One component serves desktop and phone, responsive behaviour lives in CSS, and the JS never learns the same
  media query. Effects get hidden, not deleted. (Inference.)
- *Fixed by.* Gating on exactly the CSS media query (every comma part), rerun on the MQL `change` event, keeping side
  jobs other code reads.
- *Also.* A state write is not free when it changes nothing. Svelte's `set` compares with `===`, so `z(T, [], true)`
  with a fresh `[]` reran derived blocks on every frame (FINDINGS P9).
- *Did not work.* A replace-all rename of a minified name (`cy`) broke six SVG circles, unseen by three screenshots
  (FINDINGS P1).
- *Rule.* When CSS disables an effect, the JS reads the same condition. Inventory what really runs (`getAnimations()`,
  counters you have seen fire) before ranking fixes. Delete instead of hiding.

**Lesson 4. Two drivers on one property.**
- *Original.* JS eases the future card's `--future-shrink` while its 0.9 s `transform` transition stays on. Every frame
  retargets the transition (CONFIRMED, CSS Transitions spec), so the card trails by a further 0.7-1.3 s. A class keyed
  on the raw target flips `transform-origin` mid-scale, and the card jumps up to 270.9 px on scroll-up (Chrome desktop
  probe, `fixes/double-drive`).
- *Why.* An entrance transition and a later scroll-linked value are each right alone; nobody owns how they interact.
  (Inference.)
- *Rule.* One driver per property. If script writes it every frame, it gets `transition: none`, and class thresholds
  key on the eased value. When a tween becomes finger-driven, re-check every sub-motion at the new speed.

### B. Properties the engine cannot hand to the compositor

**Lesson 5. Layout properties in decoration.**
- *Original.* The "o" opens with a 0.92 s transition of `grid-template-columns` (0.6042em → 5.25em) and `height`. Its
  faces animate `max-width`, `width`, `margin` and `border-width`, and it replays on every re-entry (CSS 2465-2593). The
  accent word transitions `width`, and the avatar exit animates `width`, `flex-basis` and `margin`.
- *Cost.* Chrome 6x: 57 layouts while the "o" grows, against 3 with its transitions off (`fixes/people-avatars`). Idle
  at the top: 231-330 layouts per 5 s (`fixes/layout-animations`). In the user's own swipes, the 0.9 s opening averaged
  26-38 ms per frame, against 16.7 on g0.0m (article Day 8).
- *Why.* It is the simplest CSS for "grow this", at a few ms per frame, felt only when the main thread is already busy,
  which here is always. (Inference.)
- *Fixed by.* FLIP without reads (FINDINGS T5): set the final width at once, then slide "p" and "ople" back from
  `translateX(±Δ/2)` with WAAPI, Δ from the stylesheet's em values. Chrome layouts fell from 56 to 4, Simulator from 30
  to 8 (`fixes/people-gpu`). In-between frames differ by sub-pixel resampling, so it went to the user as a proposal
  (PR-031).
- *Rule.* A size change becomes a transform, with distances from the stylesheet, never from a rect read. Check both
  directions and RTL.

**Lesson 6. Paint-only animations: stroke-dashoffset, background-position, SMIL, step-end.**
- *Original.* The accent word animates `stroke-dashoffset` on three SVG copies, plus a `0.6s step-end infinite` "boil".
  The platform titles sweep `background-position` on `background-clip: text`, and a glint is SMIL `<animate>`.
- *Cost.* Simulator, per accent draw: about 57 style, 57 layout and 61 paint records (`fixes/illusion-accent-frames`). At
  the page bottom, a page that "should be idle" ran 240 style passes and ~481 paints per 4 s sweep cycle in Chrome;
  after the fix, 8 and ~33 (`fixes/platform-idle`).
- *Why.* These are the standard tricks for a hand-drawn line and gradient text, and they look right on desktop. That
  WebKit treats a dashoffset change as an SVG layout change (CONFIRMED, `StyleDifference.cpp`) is in no tutorial.
- *Fixed by.* The boil's `step-end` became a keyword `linear` ramp ending on the same instants, with byte-identical
  frames; in iOS 26, `steps()` and `linear()` with points stay on the main thread (CONFIRMED for iOS 26.x). The sweep
  became a gradient band on `::after` moved by `translateX` (user-accepted PR-009). Whether that band composites on
  WebKit is UNRESOLVED.
- *Did not work.* Replacing the accent word. Alone on a test page the SVG word made 0 slow frames; on the full page it
  sat in 4-8 per run. The cost was the rest of the page sharing its frames (lesson 29).
- *Rule.* Check every animated property against a per-engine compositor list before approving the design.

**Lesson 7. Text typed one character at a time inside size containers.**
- *Original.* Typing effects write one character per 18-32 ms, plus a rAF count-up, each a reactive state write
  (JS ~2424-2520, ~11606-11659).
- *Cost.* Chrome 1x, 9.3 s window: commission layouts 226 → 97 when typing two characters per step. In WebKit a restyle
  under a size container runs an interleaved layout inside style recalc (CONFIRMED; "whole view" WEAKENED). #platform
  nests six containers.
- *Rule.* Reveal text in chunks or by a clip, in a fixed-size box. Keep `container-type` off ancestors of anything that
  changes per frame.

### C. WebKit layout traps

**Lesson 8. Presence flips: a 104x32 avatar pill relaid out the whole view once a second.**
- *Original.* Every ~1 s the avatar rotator (JS 11330-11356) swaps an `{#if}` branch, mounting fresh `<img>`s whose pop
  animation ends at `opacity: 1`.
- *Cost.* Phone, 30 s idle: a whole-view Layout of 10 ms or more followed 71 of 71 slide starts on the wave-1
  build (aw1-10e). With
  slots kept mounted it was 24/35; with rest values that never flip, 1/36 (`fixes/rotator-st6`). At rest at the top,
  slow frames per run fell from 19-27 to 0 (article Day 3).
- *Why.* WebKit treats transform none↔some, filter none↔some and opacity crossing opaque as differences that need a
  layout (CONFIRMED, `StyleDifference.cpp`); Blink does not. Our first read blamed the countdown, which also ticks at
  1 Hz (lesson 27).
- *Rule.* Rest on the animated side (`opacity: 0.999`, `scale(1)`), keep elements mounted, and read the Layout root in a
  Safari Timeline.

**Lesson 9. The iOS toolbar, two sticky sections and six aspect-ratio cards.**
- *Original.* While Safari's toolbar slides, `innerHeight` steps 775 → 815 in 6-14 steps, each a new layout viewport,
  and a viewport change marks every fixed and sticky renderer for layout (CONFIRMED, `LocalFrameView.cpp`). That relaid
  out the profile deck's six shells (`aspect-ratio: 353/764; height: auto`, percent-height children).
- *Cost.* Simulator, y 800-3400: the median largest layout per nudge was 25.7 / 22.7 ms in two loads, and 0.4 ms with
  `height: calc(100cqi*764/353)` (`fixes/sticky-walk`). Phone, finger-down y 1000-3400: Layouts of 5 ms or more fell
  from 152-159 to 0-1 and slow frames from 12-18 to 2-6 (g0.0j).
- *Why.* Aspect-ratio cards and sticky heroes are stock devices; their product appears only with the iOS toolbar and a
  finger. In our setup Chrome's emulation has no toolbar resize. We found it by a knock-out bisect; which link carries
  the layout into the shells is UNRESOLVED.
- *Did not work.* `contain: layout` (only layout plus size makes a WebKit layout boundary, CONFIRMED), svh/lvh pinning,
  `content-visibility`.
- *Rule.* Next to sticky or fixed elements, give repeated cards a definite size from a width formula, and test with the
  toolbar moving.

**Lesson 10. Broad pause rules and lazy-render gates that flap.**
- *Original.* A per-section observer (`rootMargin: 100% 0px`) toggles
  `[data-start-selling-scene="paused"] :where(*) { animation-play-state: paused !important }` and `content-visibility`.
- *Cost.*
  - The #platform switch at y ~2615 was the largest style record on the phone, 29.2-32.2 ms, mostly two nested layouts
    (`fixes/scene-scope`).
  - A deferred section's first render mid-scroll was a 54-70 ms frame in 25/25 fresh Chrome loads of the wave-1 build.
    The gate also flapped 800 times per 10 s (`fixes/scroll-engine`).
  - About 10 of the phone's 14-17 slow frames per run sat on ~8 such flips (`measurement-review.md`).
- *Why.* Both ideas are good. Applied per section, each flip invalidates a subtree, and deferral changes the size, which
  flips the observer again.
- *Rule.* Pause the animated element, not a section; give deferral hysteresis and an idle pre-warm; count your gate's own
  writes at idle.

### D. Layers, paint, raster and memory

**Lesson 11. The end-of-page morph resized composited, blurred layers every frame.**
- *Original.* A 680 ms ease-out tween writes `--morph` (0 = nav pill, 1 = full-screen menu). CSS maps it to the nav's
  `width`, `height`, `top`, `border-radius`, a `color-mix` background and
  `backdrop-filter: blur(calc(20px*(1-var(--morph))))` (CSS 11331-11343). The panel gets `filter`, `opacity` and `scale`.
- *Cost.* Phone, finger: tween frames had a p50 of 58-68 ms, with 62-84 % very slow (`morph-endpage.md`; later judged
  ~2x inflated by touch path and heat, 29-35 ms under a scripted driver). Chrome 6x showed 110 fps and no very slow
  frame.
- *Why.* It is a lovely, simple design, and smooth in Chrome, where the throttle slows only the main thread (CONFIRMED).
  In WebKit, resizing a non-tiled composited layer discards its backing store and repaints it all (CONFIRMED,
  `RemoteLayerBackingStore.mm`). That turned out to be the largest of 4-5 terms of 3-10 ms each, not the whole story: a
  size-stable panel saved 4-10 ms against a predicted 30-45.
- *Fixed by.* compositor-morph (PR-030): transforms on a scroll timeline, with the changing rounded box rebuilt from four
  corner clippers scaled by r/32 and counter-scaled. Phone Paint per morph frame fell to 0.28-0.29x
  (`fixes/compositor-morph`). On the g0 line, rolled back to the original behaviour, the card was played by one
  `element.animate()` with an exact `cubic-bezier` split of the same curve. The final build returned to CM's
  finger-following end with a constant 20 px glass. Animating `backdrop-filter`'s blur on the scroll timeline had
  dropped the glass under a moving finger, in 12 of 33 Simulator frames (OBSERVED, `fixes/cm-return`).
- *Did not work.* Blur removals scored by rAF gaps. Whether render-server time is on the rAF path is UNRESOLVED; our
  source reading says it is not.
- *Rule.* Build the panel at its final size and reveal it with clip, transform and opacity. Never animate the size,
  radius or blur of a promoted layer.

**Traps of the scroll-timeline fix itself** (`gpu-compositor-playbook.md` §4):
- WebKit still restyles every active scroll-driven target on every rendering update (CONFIRMED by source; 0.72 ms per
  frame on the phone), so keep the animated set small. CM animated about 40 elements.
- A new scroll-driven animation drew nothing in its first frame (OBSERVED, F-162). Write inline values for that frame.
- An `entry` range ended early when the toolbar made the viewport shorter (OBSERVED, Simulator). Use
  `cover 0% cover 100lvh` on a 100lvh element.
- State flipped by threshold buckets never reached its end value because the last bucket stopped short. Add a bucket
  for each resting end.
- A scroll-driven `backdrop-filter` dropped the glass under a moving finger (OBSERVED, cause UNRESOLVED).

**Lesson 12. Layer count is a multiplier: ten layers per countdown digit.**
- *Original.* Each digit (JS 3823-3876) stacks ten `.face` spans, each `will-change: transform` (CSS 1409), moved by a
  rAF spring after every tick. There are about 80 face layers in the hero clock and more in a copy inside the hidden
  menu.
- *Cost.* On the phone, ~80 of ~96 paints in heavy morph frames were 18x37 px digit cells. Cost scaled with layer count
  far more than area, about 0.14 ms per repainted layer (derived; `postmortem-morph.md` §1b,
  `safari-render-signals.md`). One strip per digit took the clock's backing
  from 48 to 16 layers and its re-entry paint from 53.5 to 21 (`fixes/cd-strip`).
- *Why.* `will-change` on each moving part is textbook advice, and nobody multiplies 8 digits by 10 faces by 2 clocks.
  (Inference.)
- *Did not work.* A CSS transition per face, which sweeps faces through the window on the 9 → 0 wrap.
- *The opposite case.* A small, often-changing element inside a big layer redraws the big one. Giving the end menu's
  clock its own layer cut menu-centre redraws per opening from 196 to 11 (redrawn backing ~1117 → ~287 MB), for one
  more layer and +1.2 MB (g0.0i, BEST_BUILDS).
- *Rule.* Budget layers by count, per component. Merge repeated static parts into one layer, isolate small ticking
  parts from big layers, and put no animated widget inside a panel that resizes.

**Lesson 13. Layers built in the frame the interaction starts.**
- *What happened.* WebKit keeps no layer pool (CONFIRMED for detach), so a design that flips structure as the menu opens
  builds and paints layers in that frame. Our own GPU redesigns of the end page failed the first-open gate six times in
  a row; the measured ones were 6.5-11 ms worse, for example v12 at 38.5 against 29.5 ms, with about 11 layers built
  per open. Later opens on v13
  were twice as good (median 9.5 against 19.25 ms) (`research/end-of-page-fresh` M1, BEST_BUILDS).
- *Why.* Chrome and Simulator counts improved every time and see no layer-build or Composite cost. Count-based
  predictions missed in the same direction five times (M6).
- *Fixed by.* Building the menu's layers at a still moment near the end (v14: first open 26.5 against 28.5 ms, at
  +10.6 MB), then two flat GPU layers plus a clip for the bar (g0.0f, ~11 MB less). Layers are released at rest too:
  holding the closed menu's photo columns as a still picture instead of a paused animation cut Simulator graphics memory
  from 27.6 to 12.4 MB (g0.0h).
- *Rule.* No layer is created, destroyed or resized in an interaction's first frame. Check that with a layer census
  before building.

**Lesson 14. The reveal: one threshold with three owners, painted in one frame.**
- *Original.* At hero progress 0.72 (JS 11310), one frame does three things: it reveals #people, flips the pain section
  dark, and drops the nav's hero pill. The card goes from `visibility: hidden; opacity: 0; filter: blur(14px)` to
  visible over 0.7 s (opacity), 1.6 s (blur) and 0.9 s (lift) (CSS 2393-2414). In our Simulator census the hidden card's
  layers had no backing store, so they allocated and painted in that frame.
- *Cost.* Phone Timeline: the flip frame took 58.2 ms (Layout 13.9, Composite 23.7) and the next 43.3 ms
  (`postmortem-hero.md`). In the Simulator the flip allocated about 41 MB (`fixes/reveal-paint`). After a fast flick the
  blur was still sharpening when the scroll stopped, and the user saw the deck "blink" (`fixes/people-blink`).
- *Why.* Fade up from blur is the stock premium reveal, tuned on slow scrolls. Separate components hooked the same
  threshold. (Inference.)
- *Fixed by.* Cutting the blur's invisible tail (a resampled `linear()`, 1.6 → 0.9 s), then skipping the fade after a
  fast flick (PR-041, a user-accepted look change). On touch screens the deck photos now load and decode after page
  load, so all 26 were ready at the flick in every run, against 7 of 26 (P-174, `fixes/people-blink`). Finally g0.0m keeps the card painted at opacity 0 on touch screens:
  the reveal frame on a flick fell from a median of 50 to 30.5 ms, for about +22 MB of graphics memory until it shows.
- *Rule.* One threshold, one owner. Pre-paint what a reveal shows, end transitions before a fast flick lands, and write
  down the memory price.

**Lesson 15. Large-area blur, and the "GPU-friendly" retiming that doubled it.**
- *Original.* The 1.6 s blur on the screen-tall card keeps filtering an opaque card for 0.9 s at under 1 px. Entry
  keyframes end on `blur(0)` with `fill-mode: both`, leaving a no-op filter behind.
- *Cost.* Cutting the tail took phone paint area from 53.6-54.7 to 48.1-49.2 Mpx per run, while the Chrome A/B stayed
  within noise (`fixes/large-area-blur`). Chrome does not composite blur animations (CONFIRMED, reason 4096).
- *Did not work.* A `cubic-bezier` blur that Core Animation could run. The Simulator's Composite after the reveal went
  from 54.6 to 111.1 ms (medians) with ~48 MB more layer memory, and that frame went from 42 to 74 ms on the phone
  (`fixes/blur-cubic-v8`).
- *Rule.* No animated blur on viewport-sized layers. Cross-fade a pre-blurred layer, never leave `blur(0)`, and after
  moving work to the compositor count Composite and memory, not only Paint.

**Lesson 16. Big decorative pictures on the last screen; smaller files did not buy frames.**
- *Original.* The end stages and the menu's photo wall use desktop-size pictures under grain and blend: five 1282x1282
  PNGs in ~138 px columns, ~33 MB decoded. No `<img>` has `srcset`.
- *Cost.* On the phone, switching off the end-of-page background pictures (and three title sweeps drawn as backgrounds)
  cut slow frames from a median of 16 to 3 per run, with every off run below every on run (`fixes/end-bg` P-137).
  Chrome paint counts were equal in every arm. Re-saving 45 files cut their natural-size decode (an upper bound) from 95.0 to 35.3 MB, but no
  frame or memory gain beat the A/A spread (`fixes/image-size`).
- *Why.* Designers export once at 2-3x for the biggest screen, and the cost is per paint of a big store, which Chrome's
  counts cannot show. (Inference.)
- *Status.* The options (resize, AVIF, baked backgrounds) are a user proposal, not shipped.
- *Rule.* Serve display size times DPR. Flatten picture, grain and blend into one image. Judge the last screen in WebKit
  paint on the phone.

**Lesson 17. Stacked effects that break per engine.**
- A blurred picture in a rounded `overflow: hidden` card showed grey corner squares in Safari, a WebKit regression
  (CONFIRMED, bug 312584) also on the original; one clip rule fixed it.
- Removing a nested `backdrop-filter` darkened a pill (0.51 % of pixels, FINDINGS P8).
- A Chrome corner artifact came from `Page.captureScreenshot` alone; screencast frames were clean.

*Rule.* Test filter, clip and backdrop combinations in Safari, and capture Chrome with screencast.

### E. Work nobody can see

**Lesson 18. Loops that never stop.**
- *Original.* Both countdowns run forever: off screen, faded, and at opacity 0 in the hidden menu. The hero keeps
  animating under the opaque People card. Sweeps, glint and vinyl repaint at the page bottom. The scene gate counts a
  tall section active a full screen away.
- *Cost.*
  - Chrome at rest mid-page, no clock on screen: the page restyled 1,816 elements per second, and the countdown spring
    accounted for 64 rAF fires per second (`frame-audit.md`).
  - Simulator at the People title: 56 layouts per 2 s, against 2 with everything outside #people paused. Pausing the
    covered hero took 65 → 2 layouts and 74 → 0 paints, pixels identical (`fixes/hero-covered-pause`).
  - Heat, absolute slopes from P-068 on 3 Oct (not comparable with the over-the-floor numbers in section 2): the
    original warmed the phone +0.620 / +0.400 °C/min against apple.com's +0.055 / -0.013 (`research/phone-heat`).
- *Why.* Animations are `infinite` by habit, gated per section, not per effect. Idle cost never shows on a plugged-in
  desktop or in a scroll profile. (Inference.)
- *Fixed by.* An observer on the animated element plus the covered and faded states (an observer cannot see opacity 0).
  Pausing via `getAnimations()` resumes from held time. The pause shifts an infinite loop's phase, so screenshot diffs
  rise with no visual change (FINDINGS P11).
- *Rule.* Every loop has a visibility owner, an acceptable paused frame and an ended state. Park the page 6 s at each
  scroll position: style, layout and paint should be about 0.

**Lesson 19. A 1 s timer that skips a second on a hot phone.**
The countdown uses `setInterval(..., 1e3)` (JS 3936). Under thermal mitigation, WebKit aligns repeating timers at
nesting level 5 or more to a 30 ms grid and re-arms from the actual fire time (CONFIRMED on WebKit main; iOS 26
equivalence UNRESOLVED). We measured ~1020 ms per fire at Serious, so a displayed second drops about every 50 s
(`fixes/countdown-tick`); in our setup Chrome did not drift.
*Rule.* Derive displayed time from the clock, aim timers at absolute times, test hot, and give a promotion a cheap
"ended" state.

**Lesson 20. A third-party scroll listener.**
gtag's scroll tracking runs on `scrollend`, 59-76 ms per scroll in Chrome 6x, the largest single long frame left
(`fixes/vendor-scrollend`). Deferring it moved a task of the same size to idle in 3 of 5 runs. Only the owner's
analytics switch removes it.
*Rule.* Measure with and without vendors, and keep their work off scroll.

### F. Interaction design

**Lesson 21. A scroll-jacked ending, a rewrite, a rollback and a return.**
- *Original.* Near the end an observer arms `wheel` and `touchmove` listeners as `{passive: false, capture: true}`
  (JS 13060-13072) that `preventDefault()` and play the tween. `window.scrollTo(... 'instant')` pins the page. The same
  callback mounts the heavy panel inside a scroll frame, a 42-75 ms long frame in Chrome 6x
  (`fixes/morph-panel-lazy-mount`). Scripted scrolls cannot see listener cost (passive against non-passive: 52.7
  against 52.5 fps on the phone).
- *Our mistake.* We rebuilt the end so the menu follows the finger (PR-018, then CM in v14). The user accepted it,
  then found defects per gesture class: lost momentum, a 3-5 s settle, fast short swipes that would not open, and the
  bar's top row creeping. Robot gestures missed some of these, and about 349 fix commits went into that line.
- *Rollback.* On 2026-10-07 the user asked for the original behaviour back, made cheap on the GPU (g0.0b). Each of the
  original's own visible flaws then got its own small fix.
- *Return.* On 2026-10-09 the user accepted PR-040 (g0.0k), which brought v14's finger-following end back on top of
  those fixes. It kept a constant glass and fixed two v14 bugs (a closed-bar jump and a replayed sweep). The final
  build's menu follows the finger; the original's opens by itself.
- *Rule.* Prefer native scroll. If you must hijack it, make the interaction time-based or finger-driven, but compositor-played, never
  mount the target in the scroll frame, and put a human finger in the loop from the first build of a new interaction
  model.

**Lesson 22. Where in the motion a stall lands.**
On a test page the user compared the same three 50 ms gaps placed in the fast start or in the slow landing of an
ease-out. In a counterbalanced repeat block, the landing version was picked as smoother in 8 of 8 forced choices, at
full, half and quarter speed. An earlier single, tired session had gone the other way
(`research/design-engineering/pacing-result.md`, one user: a direction, not a calibration). The repeat made the
eye-pursuit explanation moot.
The original morph did the opposite: its ease-out put the slowest frame, frame 2 (p50 48 ms), at peak velocity
(`unknowns-ux.md` §0.4).
*Rule.* Keep unavoidable work (layer builds, mounts, decodes) out of the fast start of an eased motion; the slow
landing tolerates a stall better.

### G. Measurement and process (ours and the usual ones)

**Lesson 23. The wrong engine and device, and proxies used outside their validity.**
- The phone's CPU is not slow: a micro-benchmark took 261 ms on the iPhone against 255 ms in Chrome 1x on the Mac. The
  page likely janks because WebKit pays different stages, Safari renders at 60 Hz, and touch paths run (inference
  from `research/cpu-throttle-calibration`).
- Chrome 6x matched the phone's scripted counts (12.3 against 15.7 slow frames per run), OBSERVED with limits. The
  throttle is super-linear for DOM work (6x costs 7.8x) and blind to raster.
- In our setup the Simulator was not usable for A/B direction (one morph comparison reversed with disjoint ranges), and
  was fine for function checks (`research/simulator`).
- A Simulator win can be a phone loss: one reveal cut paints per frame from 12.2 to 2.3 and opened 6.5 ms slower on the
  phone (`stats-vs-finger.md`).

*Rule.* Name the target device on day one, run a validity study per proxy, and treat everything outside it as leads.

**Lesson 24. A scripted scroll is not a finger, and frame stats are blind to behaviour.**
- Finger scrolls dropped about twice the frames of scripted ones in our setup (24-30 % against 13.6 %).
- In blind swipes, only very slow frames per 100 moving frames in the finger's zone, from the swiped run, agreed with the
  user's pick (7 of 7). Chrome and robot numbers disagreed in 5 of 8 (article, "Lessons" card 2). An estimated 59-85
  agent-hours went to fixes that won in Chrome or robot tests and lost on the phone (article, estimate).
- Settle time, lost momentum and a half-open panel were felt and not counted (lesson 21).

*Rule.* Record the real gesture first and replay it. A blind finger A/B is the final authority, so track each lab
metric's agreement with it.

**Lesson 25. Averages and the steady scroll hide the frames users feel.**
- About 10 of the phone's 14-17 slow frames per scripted run sat at ~8 positions where state flips
  (`measurement-review.md`).
- The rest sat in idle loops, first entries, first opens, deferred first renders, and the first seconds after load: 17 %
  of moving frames slow in the first 8.5 s, against 1 % after 20 s (`research/serious-heat`).
- LoAF reports only frames of 50 ms or more (CONFIRMED), so ~100 frames over 20 ms per run were invisible to it.
- Fixed thresholds need twins. Every difference between g0.0l and g0.0m on the phone flipped when the line moved 4 ms
  either way, so the two builds count as level (article Fig. 16).

*Rule.* Count frames over 34 and 50 ms (goal 0) per zone and interaction, plus the longest, logged with scroll position
and time since start. Report ±4 ms twin counts, and call a verdict that flips "threshold-sensitive". Build the test
matrix by state change.

**Lesson 26. Heat, host state and noise.**
- In our setup, induced Serious did not slow a CPU loop but slowed a sustained GPU animation by ~25-35 % (cause UNRESOLVED).
  So moving work to the GPU probably loads what heat throttles (inference). On 9 Oct the original drove the phone to Critical at the end of the page.
- Chrome frames over 20 ms on the unchanged baseline were ~66 at load below 6 against 96-103 at load 6-15 (FINDINGS).
- Three runs with disjoint ranges are only about p 0.05 per metric, and each A/B looked at ~14 metrics
  (`measurement-review.md`). Our prediction ledger shows at least 17 flagged misses in 153 rows.

*Rule.* Record thermal state, test warm, use one quiet machine and interleaved runs (C V V C), and measure an A/A floor
first. A win smaller than the A/A spread is no win.

**Lesson 27. The script that pays a layout is not the one that causes it, and probes become "facts".**
- A Timeline trace separating the code dirtying layout from the code paying for it showed the countdown's writes were
  composited translates; the rotator caused the 1 Hz layouts (`postmortem-hero.md` §7).
- A capped logger hid the real event at y ~1960 (a listener add, not an image burst). A MutationObserver on the wrong
  container read 0 (FINDINGS P10).
- "Chrome 154 never sends layerPainted" rested on two probes and reached the user as fact. Source later CONFIRMED the
  absence and REFUTED our cause (claims-audit C1).

*Rule.* Find the dirtier, prove a counter can fire before trusting its 0, write predictions first, and confirm platform
claims against the exact engine version.

**Lesson 28. Why the end of page took ten-plus iterations.**
- We binned frames by morph value, not time; the "mid-tween hump" was a start transient (115-127 ms of excess in the
  first ~300-400 ms of every build).
- We scored blur with rAF gaps and predicted from a finger baseline inflated ~2x.
- We bundled fixes per build, and let a first-frame gate at n=4 veto builds better in every later frame.

Of 19 phone blocks in the area, 5 passed or held, 6 failed, 5 were open or insufficient, 2 were attribution-only and
1 was mixed (`end-of-page-fresh` M9).
*Rule.* Log against time since start, with the instrument that sees the stage. Make one change per block with a named
control, and rank causes by how cheaply they falsify.

**Lesson 29. "Looks the same" needs a tolerance, and a unit needs an isolation test.**
- The standard diff (R+G+B summed over 48, three points, animations running) cannot see a 9-level shade, and its noise
  band is 0-0.4 % (`research/pixel-tolerance`).
- A clip taken after a scroll captured blank strips, so every "0 %" after a scroll was a false pass (FINDINGS P14).
- The project rule: a look-alike is byte-exact, or within fixed tiers against a Chrome and Simulator A/A, or it is a
  proposal with live A/B pages.
- Test a unit alone before promising a gain from replacing it (lesson 6).

*Rule.* Fix the tolerance first, freeze animations at equal times, test the diff tool for blank passes, and compare
motion.

**Lesson 30. No budget, so cost grew where nobody was charged for it.**
- A derived budget for this phone at 60 Hz is ~8-12 ms of variable main-thread work per frame: ~120-300 restyled
  elements, ~1.5 Mpx painted, ~10 MB new backing, no layout reads in moving frames, and no rAF at rest.
- The page's hotspots broke it 2-10x on one term each, and the morph broke several at once, so one removal saved only
  6-9 ms (`apple-math.md`, derived).
- Apple's pages keep per-frame work on leaves and move subtree-sized work to load, resize or off-screen range edges.
- The budget must include memory: g0.0m pays +22 MB for its reveal, compositor-morph ~21-45 MB while open (Chrome
  estimate).
- What worked as a guardrail here: a "less work" fix landed on a cost card (layouts, paints, layers and rAF per 6 s
  rest window, in Chrome and the Simulator) plus a short phone no-worse check (memory `less-work-landing-rule`).

*Rule.* Write the budget before the design, and check every change against it automatically.

## 4. Why these mistakes happen

Root causes across the lessons. **E** marks evidence from the repo; **I** marks inference.

1. **The team sees a different machine than the user.** Chrome at 1x showed 0.0 slow frames per scripted scroll in
   mobile emulation (0.3 on desktop), where the phone showed 15.7. The morph ran at 110 fps in Chrome 6x and at a p50 of 29-68 ms per frame on the phone (driver to finger) (E: lessons 11
   and 23). That the original team developed mainly in desktop Chromium is I.
2. **Cost is per engine and per pipeline stage, and the rules are not in tutorials.** WebKit relayouts on presence flips
   and on dashoffset changes, discards backing stores on resize, and keeps `steps()` on the main thread. Chrome refuses
   to composite blur animations. All of these are CONFIRMED by engine source, and none is visible in the stylesheet (E:
   lessons 6, 8, 11, 15).
3. **Each effect is cheap alone, and frames are shared.** The accent word alone made 0 slow frames; on the full page the
   same word sat in 4-8 per run. Forced layout moved to the next reader. One-term savings were 6-9 ms (E: lessons 1, 6,
   30). Designing and reviewing effects one at a time is I.
4. **Nobody owns the frame, the threshold or the lifetime.** Three effects flipped at 0.72; two drivers shared one
   property; loops had no visibility owner (E: lessons 4, 14, 18). That this follows from component-per-effect
   development is I.
5. **"Promote it, move it to the GPU" is folklore without a price list.** It worked for transforms and opacity, but a
   compositor blur doubled Composite, layers built at first open cost 6-11 ms, and the final reveal pays 22 MB (E:
   lessons 13-15). The GPU also slows under heat (E, our setup).
6. **The usual metrics are blind where it matters.** fps averages, LoAF at 50 ms, scripted scrolls, a CPU throttle that
   cannot see raster, and no idle phase (E: lessons 23-25). The original team's tooling is I.
7. **Desktop-first responsive code.** CSS turns effects off on phones while JS keeps driving them, and assets are
   exported once at the largest size (E: lessons 3, 16; motive I).
8. **On our side: confirmation from cheap counts.** We predicted from Chrome and Simulator counts, scored the wrong
   axis, bundled changes, and let probes harden into claims. Each was caught by the phone, the user's thumb, or a
   source read (E: lessons 24, 27, 28).

## 5. What to consider when building a site with complex animation and design

### Design

- [ ] **Motion inventory.** List every moving thing with its trigger (time, scroll position, finger), the property it
  changes, its cost class per engine (compositor, paint, layout), its visibility condition, its paused frame, its
  reduced-motion path and its "ended" state (lessons 3, 6, 18).
- [ ] **Budgets per frame and at rest.** Main-thread ms, restyled elements, painted Mpx, layers per component, new
  backing MB, graphics memory, 0 layout reads in moving frames, 0 work at rest (lessons 12, 30).
- [ ] **One owner per scroll threshold.** Do not stack a reveal, a theme flip and a nav change at one y (lesson 14).
- [ ] **Design for the fast flick.** Reveal tails end before a flick lands. Keep heavy work (layer builds, mounts,
  decodes) out of the fast start of an eased motion (lessons 13, 14, 22).
- [ ] **Prefer native scroll.** Hijacking needs a time-based, compositor-played interaction and finger tests from the
  first build (lesson 21).
- [ ] **Limit blur.** No animated blur on viewport-sized layers; pre-blurred layers cross-fade instead (lesson 15).
- [ ] **Look-alikes are product decisions.** For each effect, say whether a pixel-identical compositor form exists and
  what the fallback look is (lessons 6, 29).

### Build

- [ ] **Compositor-only motion.** Animate only transform, translate, scale, rotate and opacity, plus filter with care.
  No `var(--x)` in keyframes, and no `steps()` or `linear()` points on iOS 26 (lessons 2, 5, 6).
- [ ] **Declarative drivers.** Scroll position goes to `scroll()`/`view()` timelines, time to CSS or `animate()` with
  keyword or `cubic-bezier` easing. Keep a JS fallback behind `@supports` (lessons 2, 11).
- [ ] **Scroll-timeline traps.** Keep the animated set small (WebKit restyles each target every frame), cover the first
  frame with inline values, use `cover 0% cover 100lvh` ranges, give both resting ends a bucket, and do not animate
  `backdrop-filter` on a scroll timeline (traps after lesson 11).
- [ ] **No per-frame layout reads.** Use observers instead of rect tests, and geometry from a ResizeObserver size box.
  Reads go before writes, once per frame. Remember that `scrollY` runs pending layout in WebKit (lesson 1).
- [ ] **Animated custom properties stay local.** Do not drive them per frame from a section root (lesson 2).
- [ ] **One driver per property.** No transition on a property script writes (lesson 4).
- [ ] **Pause per element.** Pause off screen, covered and faded states, and resume from held time (lesson 18).
- [ ] **Rest states off the flip.** Use `opacity: 0.999` and `scale(1)` rather than 1 and none, and keep elements
  mounted (lesson 8). Make a no-op state write a real no-op (lesson 3).
- [ ] **Containment that WebKit honours.** Definite card sizes from width formulas next to sticky or fixed elements,
  layout plus size containment, and no size containers around per-frame text (lessons 7, 9).
- [ ] **Layers on a budget.** Merge repeated static parts and isolate small ticking ones. Create layers at load or a
  still moment, never resize them in motion, release them at rest, and write the MB down (lessons 11-13).
- [ ] **Pre-paint reveals.** Pre-paint what a reveal will show, and decode images before they appear (lessons 14, 16).
- [ ] **Images at display size.** Use `srcset`/`sizes` per DPR and modern formats, and flatten decorative stacks into
  one image (lesson 16).
- [ ] **Timers from the clock.** Aim timers at absolute times (lesson 19).
- [ ] **Vendor budget.** Third-party tags get a budget and are kept off scroll (lesson 20).
- [ ] **One media query per effect.** JS gates effects on exactly the CSS media query, and dead effects are deleted
  (lesson 3).

### Test

- [ ] **A real iPhone with Safari**, the slowest target you ship to, from day one, and every engine you ship to (lesson
  23).
- [ ] **Counts, not averages.** Frames over 34 and 50 ms per zone and interaction, plus the longest frame, logged with
  scroll position and time since start, with ±4 ms twin thresholds (lessons 25, 28).
- [ ] **Scripted and finger.** The user's real gesture, recorded and replayed by a robot, plus a blind finger A/B, plus
  behaviour checks: settle, momentum, reversal, toolbar (lessons 21, 24).
- [ ] **Heat.** Test warm (Serious) as well as cool, and record the thermal state on every run (lessons 19, 26).
- [ ] **Know the limits of Chrome CPU throttling.** It slows the main thread only, the factor is calibrated per page and
  metric, and it is blind to raster, blur, layers and WebKit layout. The Simulator answers function questions, not
  timing (lesson 23).
- [ ] **A rest test at every scroll position**, plus load, first entry, re-entry, first open and later opens (lessons
  18, 25).
- [ ] **WebKit Timeline and a layer census** (layers, MB, paints) at rest, mid-motion and after (lessons 12, 13).
- [ ] **Ablation before optimisation.** Removing a group shows the most any fix of it can gain (lesson 16).

### Guardrails

- [ ] **A performance budget in CI.** Restyle, layout, paint, layer and memory counts per change, as the cost cards
  did here, plus a phone check for anything visual or WebKit-specific (lesson 30; running it in CI is our
  recommendation, not something this study did).
- [ ] **A/B with a noise floor.** A/A at the same load, interleaved order, a pre-registered decision rule and n,
  correction for many metrics, and invalid runs labelled (lessons 26, 28).
- [ ] **Pixel-identical rule for look-alike changes.** A fixed tolerance, frozen frames and A/A pairs; anything visible
  goes to design as a proposal with live A/B pages (lesson 29).
- [ ] **Platform claims carry a status.** OBSERVED until a source, doc or bug confirms it, and never passed on as fact
  (lesson 27).

## 6. Platform facts

From the verifier's table. "WK main" line numbers are WebKit main as read on 2026-10-12. The phone runs the 7624 branch,
so line numbers may differ there; the mechanism is what is confirmed.

| # | Claim | Status | Reference |
|---|---|---|---|
| 1 | Chrome never composites a `stroke-dashoffset` animation (compositeFailed 8224) | CONFIRMED | Chromium `compositor_animations.cc` l.399-453, 170-176; `.h` l.90, 105 |
| 2 | Chrome does not composite blur filter animations (pixel-moving filter, 4096) | CONFIRMED | same `.cc` l.408-415; `.h` l.104 |
| 3 | WebKit: a `stroke-dashoffset` change is an SVG layout change | CONFIRMED (how far the dirty bit climbs: UNRESOLVED) | `StyleDifference.cpp` WK main l.172, 417 |
| 4 | WebKit: opacity crossing opaque, filter none↔some, transform none↔some need a layout; Blink does not relayout | CONFIRMED (mechanism); "always whole-view, 12-17 ms" WEAKENED | `StyleDifference.cpp` WK main ~l.213, 219, 228 |
| 5 | iOS 26.x: `steps()` and `linear()` with points stay on the main thread; keyword `linear` and `cubic-bezier` are accelerated | CONFIRMED for iOS 26.x, not Safari 27 | `KeyframeEffect.cpp` WK main l.2008, 2011; claims-audit P5 |
| 6 | WebKit accelerates only transform, opacity, filter, backdrop-filter; clip-path, mask, custom properties stay on the main thread (Chrome adds background-color, clip-path) | CONFIRMED (clip-path repaint: UNRESOLVED) | `AcceleratedEffect.cpp`; Chromium `.cc` property switch |
| 7 | A filter keyframe of `none` matches any filter list ("never none to blur" is wrong) | CONFIRMED (refutes the old wording) | `GraphicsLayer.cpp` l.807-838; `AcceleratedEffect.cpp` l.503-565 |
| 8 | When `scrollY` is not 0, reading it makes WebKit run any pending layout first; it costs only when layout is dirty | CONFIRMED | `LocalDOMWindow.cpp` WK main l.1508-1512 |
| 9 | Safari 26.2 fires `scrollend` | CONFIRMED | webkit.org/blog/17640 |
| 10 | WebKit `setInterval` re-arms from the actual fire time and, under thermal mitigation, aligns repeating timers at nesting ≥ 5 to a 30 ms grid | CONFIRMED on WK main; shipping iOS 26 equivalence UNRESOLVED | `DOMTimer.cpp` l.59-61, 180, 343; `Page.cpp` l.3348 |
| 11 | iPhone Safari requests page rendering at 60 Hz as a hint; Core Animation may run faster. "iPhone Safari at 120 Hz on an 8.33 ms grid" is wrong | CONFIRMED (60 Hz hint); REFUTED (120 Hz grid, iPhone Safari only); 80 Hz finger trigger UNRESOLVED | claims-audit P9; WebKit bug 173434; `AnimationFrameRate.cpp` |
| 12 | Safari's rAF timestamp is the rendering-update start (1 ms), not a vsync | CONFIRMED | claims-audit P10 |
| 13 | LoAF reports only frames of 50 ms or more | CONFIRMED | w3c.github.io/long-animation-frames |
| 14 | Chrome's CPU throttle slows only the renderer main thread | CONFIRMED; "so Chrome A/B is blind to raster and WebKit-only cost" OBSERVED | claims-audit C5, §2.6 |
| 15 | CPU 6x reproduces the iPhone 15 Pro Max scripted-scroll jank counts on this page | OBSERVED with limits | claims-audit C4 |
| 16 | A size change of a non-tiled composited layer discards its backing store and repaints it all; tiling above 1280 CSS px | CONFIRMED | `RemoteLayerBackingStore.mm` l.139-152, 240-243; `GraphicsLayerCA.cpp` l.98-106 |
| 17 | A layer's sub-pixel offset change repaints the whole layer | mechanism CONFIRMED; attribution to the countdown faces OBSERVED | `RenderLayerBacking.cpp` l.1440-1466 |
| 18 | WebKit: a restyle under a size container triggers an interleaved layout inside style recalc | CONFIRMED (source); "whole view" WEAKENED | claims-audit W4; `StyleTreeResolver` |
| 19 | Adding or removing a window wheel listener changes event-region types and forces a style rebuild; "passive:false once makes the page a sync touch region for life" | wheel CONFIRMED; touch version unsupported; "for life" REFUTED on 26.6 | claims-audit W5, W6 |
| 20 | In WebKit, layout plus size containment makes a layout boundary, `contain: layout` alone does not; Chromium never makes a flex item a relayout boundary | CONFIRMED (source reading) | WebKit `RenderObject.cpp` l.519-533, 596-648; claims-audit W2 |
| 21 | A large visible image that first paints on an already-painted layer decodes synchronously at natural size inside Paint; async decode is at drawn size | CONFIRMED (source); as sole cause of the late deck-photo wave REFUTED | `RenderBoxModelObject.cpp` 303-367; `BitmapImageSource.cpp` |
| 22 | WebKit keeps no layer pool; an off-screen composited layer drops its backing store but is still visited every scrolled frame | detach CONFIRMED; per-frame ms UNRESOLVED | `GraphicsLayerCA.cpp` l.3074-3116 |
| 23 | Qualifying scroll-driven animations run threaded on iOS 26, and every rendering update still restyles each target | CONFIRMED (source); 0.72 ms per frame OBSERVED | `UnifiedWebPreferences.yaml` 8316-8329; `KeyframeEffect.cpp` 2081-2088 |
| 24 | Chrome 154 never sends `LayerTree.layerPainted` | absence CONFIRMED (M148+, crbug 488803411); our stated cause REFUTED | claims-audit C1, §2.2 |
| 25 | In our setup: display state moves fps; host load inflates jank; finger drops ~2x the frames of a script; induced Serious slows GPU animation ~25-35 % but not a CPU loop; the Simulator is not usable for A/B direction (Apple: Simulator rendering performance has no relation to the device); toolbar and passive-listener effects show only under a finger | OBSERVED / UNRESOLVED | claims-audit C3, P15; `research/serious-heat`; `research/simulator` |

**Not settled.** These stay UNPROVEN or UNRESOLVED:

- why six aspect-ratio shells cost 20-35 ms;
- clip-path and mask repaint behaviour;
- the sweep look-alike's `mix-blend-mode` on WebKit;
- the vinyl and pain-background repaint hypotheses;
- the ~2000 px/s eye-pursuit limit (made moot by the repeat block, lesson 22);
- Core Animation's cost for a backdrop clipped to a pill;
- whether induced Serious caps the display at 60 Hz;
- the 80 Hz finger trigger;
- "inherits: false is ~850x cheaper" (web.dev, not re-checked; stale children on WebKit);
- Safari 26 resolving keyframes that use an animated custom property against its base value (no public bug).

## 7. Sources

All paths are relative to the repository root.

- **Builds and results.** `fixes/BEST_BUILDS.md`; `fixes/FINDINGS.md`; `fixes/TOPICS.md`; `fixes/PREDICTIONS.md`;
  `fixes/all-wave1/README.md`; the article
  `research/team-article/artifacts/sixteen-milliseconds/index.html` (Figs. 4, 6, 9, 14, 17; clips 1, 3, 4; "Lessons").
- **Hero and countdown.**
  - Fixes: `fixes/countdown-idle-raf`, `fixes/cd-strip`, `fixes/cd-roll-ca`, `fixes/countdown-faces`,
    `fixes/countdown-tick`, `fixes/hero-exit-threaded`, `fixes/hero-covered-pause`, `fixes/rotator-st6`,
    `fixes/accent-ca`, `fixes/illusion-accent-frames`, `fixes/illusion-typing-chunks`, `fixes/platform-idle`,
    `fixes/main-thread-infinite-animations`.
  - Research: `research/design-engineering/hero.md`, `postmortem-hero.md`, `frame-audit.md`, `illusion-style.md`,
    `illusion-composite.md`, `research/01-initial-investigation/motion-inventory.md`.
- **Scroll, morph and end of page.**
  - Fixes: `fixes/nav-hit-test`, `fixes/hit-skip`, `fixes/commission-forced-layout`, `fixes/phone-invisible-shrink`,
    `fixes/double-drive`, `fixes/scroll-engine`, `fixes/scrollcb-g0`, `fixes/sticky-walk`, `fixes/toolbar-resize`,
    `fixes/morph-inherit`, `fixes/morph-scroll`, `fixes/morph-panel-lazy-mount`, `fixes/compositor-morph`,
    `fixes/g0-revert`, `fixes/cm-return`, `fixes/g0-0k`, `fixes/vendor-scrollend`.
  - Research: `research/design-engineering/morph-endpage.md`, `postmortem-morph.md`, `safari-render-signals.md`,
    `pacing-result.md`, `research/end-of-page-fresh/README.md`, `research/gpu-original/README.md`.
- **Paint, layers and images.** `fixes/end-bg`, `fixes/reveal-paint`, `fixes/g0-0h`, `fixes/g0-0l`, `fixes/g0-0m`, `fixes/people-blink`,
  `fixes/large-area-blur`, `fixes/blur-cubic-v8`, `fixes/people-avatars`, `fixes/people-gpu`,
  `fixes/layout-animations`, `fixes/deck-contain`, `fixes/scene-scope`, `fixes/de-offscreen`, `fixes/menu-layers`,
  `fixes/image-size`, `fixes/platform-corners`, `research/image-cost`, `research/element-ablation`,
  `research/design-engineering/devtools-render-metrics.md`, `research/architecture/gpu-compositor-playbook.md`.
- **Measurement and process.** `research/cpu-throttle-calibration`, `research/headless-60-calibration`,
  `research/simulator`, `research/serious-heat`, `research/phone-thermal-gate`, `research/phone-heat`,
  `research/host-display-state`, `research/pixel-tolerance`, `research/bench/q3-metric.md`,
  `research/architecture/measurement-protocol-v2.md`, `measurement-review.md`, `stats-vs-finger.md`, `claims-audit.md`,
  `research/design-engineering/apple-math.md`, `unknowns-ux.md`.
