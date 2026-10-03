# Fix: hero-exit-threaded

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured by mechanism and pixels (no timing: timing A/Bs deferred, user 2026-10-02). Not ready to land:
the residuals in "Options" need the user's decision, and the phone attribution slot (Timeline on, W driver) has
not run.
**Stage:** V (build card below). D: ST-1 accepted by the lead 2026-10-03 01:17Z as "partly LOCATED" (H2a and H2c
not supported on the Simulator; H2b Composite open, phone slot).
**Device class / gate:** WebKit-only build (Safari / iOS). Chrome, Firefox and other engines run the baseline
code (gate below). Evidence: Simulator counts and frozen-frame pixels, Chrome parity (headless).
**Driver(s) behind the claims:** Simulator, functional sessions (scripted `scrollTo` steps, Timeline records,
`simctl io screenshot`); Chrome frozen-scroll parity. No phone run yet (S / W / M / G / F: none).
**Prediction:** brief `research/gpu-props/README.md` §6 S1 (F2): the y≈50 frame 48 → 35 ms (earlier v2 phone run).
**Topic:** `research/gpu-props/README.md` §5 F2 / §6 S1 (restack of topic 7 `hero-exit-scroll-timeline` v2 on st6-rb2).
**Base:** st6-rb2 (`fixes/st6-rb2/`, overlay JS sha256 `7bf7c4657d21…`, CSS `f523598b2a24…`).
`patch.diff` is against the baseline snapshot, so it carries st6-rb2's changes too. Apply on the st6-rb2 overlay.
**Files touched (delta over st6-rb2):**
- `/_app/immutable/nodes/2.DyWL8TcE.js`: the hero `ne(() => …)` effect (overlay lines ~4383-4625). New helpers
  `heCss`, `heTf`, `heRest`, `heOn`, `heTS`, `heTE`, `heWK`, `hePE`, `heWrap`, `heArm`, `heSync`. Mode switch in `d()`
  and `p()`, the `dE` callback, cleanup.
- `/_app/immutable/assets/2.gBuqKVzi.css`: one new `@supports (animation-timeline: view()) and (animation-range:
  contain 0% contain 100%)` block after the hero rules (overlay lines ~2158-2320).

## Why it lags

st6-rb2's writer `s` (overlay JS ~4458-4467) runs on every scroll frame in y 0-855. The `dE` scroll callback calls
`c()`, which schedules `rAF(s)`. `s` then:
- reads `getBoundingClientRect()` of `.hero-track`;
- writes `--exit-opacity` on `.hero`;
- writes `pointer-events`.

The custom property feeds `--exit-scatter` and the opacity, translate, transform and blur of the copy, the deck
cards and the scroll cue. So each scroll frame restyles the hero subtree and repaints it on the main thread before
WebKit can paint.
- Brief: `research/gpu-props/README.md` row 2 and §6 S1. The C-026 band y < 1000 holds 63 of st6-rb2's 81 long
  moving frames.
- Simulator (this topic, OBSERVED): during a 12 px stepped scroll y356 → 884, C repaints a viewport-sized hero clip
  on every frame (21 frames, 20.2 Mpx of paint in the scroll phase).

## What changed

On WebKit, once the entrance is over (`d()`), the exit is a set of CSS scroll-driven animations on a `--hero-exit`
view timeline of `.hero-track`. The JS writer stops; no per-frame rect read and no style write remain.
- **Range.** `contain 0.05% contain 100%`, which is the JS formula `p = clamp(-top, 0, h - innerHeight) /
  (h - innerHeight)`.
- **Timing.** `1ms linear forwards`.
- **Keyframes.** Each `from` keyframe is compensated to the baseline value at 0.05%. Nothing is active at rest at
  the top, and inside the range every value is the baseline's `a + (b - a) * p`.
- **Animated properties.** Opacity, `translate`, `transform` and `filter` only. No custom property is animated.

**Gate (lead decision 2026-10-03 03:09Z).** The CSS path runs only where both tests pass:

```js
heCss = `GestureEvent` in window &&
  !!window.CSS?.supports?.(`(animation-timeline: view()) and (animation-range: contain 0% contain 100%)`)
```

- **Why this picks WebKit.** `GestureEvent` is a WebKit-only interface: Safari 9+, iOS Safari 2+, no Chrome, Edge
  or Firefox version. CONFIRMED by MDN browser-compat-data `api/GestureEvent.json`.
- **iOS.** Every iOS browser is WebKit, so all of them get the CSS path when they support view timelines.
- **Feature test.** The `CSS.supports` half requires view timelines with named ranges (Safari 26+; threaded on
  the compositor from Safari 26.4, WebKit blog post 17862, cited in the brief §0.3).
- **What other engines get.**
  - Chrome / Edge / Opera (Blink) and Firefox (Gecko, no `GestureEvent`): the baseline writer, unchanged.
  - Older Safari (no view timelines): the baseline writer.
  - The CSS rules all key on `.he-css`, which only the JS sets, so they never apply there.
- **Why not Blink.** Blink composites the animated cards and copy and blends them on the GPU. The painted
  baseline uses 8-bit alpha and pixel snapping instead, so the pixels differ: up to 6 levels on 15-42k px in the
  deck, and a 1-device-px copy shift at boundary positions (frozen-scroll harness, earlier card). That violates
  the pixel-identity rule.

**Mechanisms that keep WebKit identical (each found by a Simulator count or pixel diff, OBSERVED):**
1. **`.he-css` / `.he-tf`.** `.he-css` (set in `d()`, removed in `p()`) enables the exit animations. The copy's
   shift (`transform`) is a separate animation, present only with `.he-tf`. While `.hero-copy` carries a
   transform animation, even an inactive one, WebKit repaints the title's script accent about 1.4x as often (the
   accent gets its own composited layer). `.he-tf` is off:
   - at the top;
   - past the end, where the copy is at opacity 0;
   - at rest (item 3).
2. **Pre-arm.** A newly added scroll-driven animation is pending for one frame: WebKit drew the copy unshifted in
   the frame the class arrived. So `.he-tf` is armed before the scroll:
   - on `touchstart` (the drag starts only after the touch slop);
   - on `wheel` and `keydown` (disarmed after 600 ms if the page stays at the top).

   A scroll with none of these (programmatic, scrollbar drag, find-in-page, status-bar tap) is caught by `heSc`
   (idea: lead). The `scroll` event fires before that frame's rendering update, so the handler writes the inline
   shift for the current `scrollY` (the rest-hold formula, from `scrollY`, no layout read) and adds `.he-tf`. The
   animation's pending frame then draws the correct shift. Without it, that first frame drew the copy shift one
   frame stale (residual R3, removed; see the hand-over table).
3. **Rest hold (`heRest`).** 300 ms after the last scroll frame, with no finger down, the JS drops `.he-tf` and
   holds the copy's baseline shift as an inline `transform`. It uses the baseline formula: `translate(-50%,
   p * -8px)` on phones, `translateY(p * -10px)` on desktop. When a scroll re-adds the class, the animation
   overrides the inline value, and the inline value covers the animation's pending frame. Without the hold, the
   accent repaints 1.40x C at rest at y300; with it, 1.02x.
4. **`heWrap` / `.he-bob`.** On phones the cue's own entrance animates `--copy-in`, so its exit runs on its only
   child `.scroll-float`. The float's 2.2 s bob moves to a new span `.he-bob`, which the JS wraps around the
   float's two children (a flex column like the float, so the same layout). Two failed placements:
   - Bob and the scroll-driven exit on the same element: WebKit recalculated style on every frame at rest (241
     recalcs per 4 s at y0 vs C's 0).
   - Bob on the two children separately: the cue drew 1-2 levels off.

   The paused-scene rule `.scroll-float > *` still pauses the bob.
5. **Pointer events.** An IntersectionObserver whose top rootMargin is C's threshold `0.05 * track height + 0.95 *
   innerHeight` in px. It is re-armed on `resize`, because the toolbar changes `innerHeight`. Simulator y805-855:
   C, C2 and V all switch between y812 and y813.
6. **Blur.** Blur is its own animation from `blur(0.009px)`, and at rest the filter is `none` like the baseline.
   Past the end it keeps `blur(18px)` (fill forwards), like the baseline.

The `dE` registration stays (the scene pause and render deferral are its side effects). In CSS mode its callback
does only `heTf()`: a `scrollY` read, plus a class write when the state changes.

## Why that is faster

On WebKit the exit no longer needs the main thread per frame. The animations follow the scroll position on the
compositor (threaded scroll-driven animations, Safari 26.4+, CONFIRMED in the brief §0.3). The JS rect read, the
custom-property write and the hero-subtree restyle are gone.

Simulator counts (OBSERVED, Simulator ms never count, F-084):

| | C (st6-rb2) | V | note |
|---|---|---|---|
| Layout records, 12 px stepped scroll y368→884 (2 runs) | 241 / 247 | 175 / 196 | ST-1 card |
| RecalculateStyles, same | 199 / 203 | 163 / 146 | |
| full-hero repaints, scroll phase y356→884 | 21 frames, 20.2 Mpx | 0, 6.8 Mpx total (-66 %) | |
| stacked on cd-strip (cb45b05) | 12.7 Mpx | 10.3 Mpx | the rest is the #people reveal |
| compositing layers | 128 | 134 | orbit-cards b, d, e, hero-copy, scroll-cue, scroll-float |
| layer memory | 122 MB | 112 MB | stacked: 123 vs 112 |
| accent paints at rest, 5 s, timers on (y0 / y300 / y884) | 193 / 202 / 192 | 189 / 207 / 189 | 1.02x at y300 (1.40x before the rest hold) |
| same, final build (fin17) | 192 / 206 / 185 | 190 / 207 / 185 | |
| all other paints in the 5 s window at y884, arriving from y300 (sim10, sim13, fin17, acc19) | 15 / 9 / 10 / 13 (C2 10) | 35 / 30 / 30 / 29 | **R4**: a one-off burst, not a rate (below) |
| same, arriving from y600 (acc18) | 12 (C2 16) | 14 | no burst |

R4 located (acc19, paint rects): V's extra paints at y884 are single paints (1-2 each in the window) of the
deck cards at their scattered, off-screen end positions (x -251/-246 and 514/562, which only V draws as their own
composited layers) and of the next section's card grid below the viewport (C paints the same grid rects once it
reaches y1000, acc18). Arriving at y884 from y600 there was no burst. The window starts 1.5 s after the jump and
after a `LayerTree.layersForNode` census, which F-149 found can itself cause paints, so part of the burst may be the
census (UNRESOLVED; the decisive check is the same run with no LayerTree census).
| style recalcs at rest, timers cleared, 4 s (y0 / y300) | 0 / 29-33 | 0 / 31-35 | |

The extra layers are the elements the compositor now animates. The phone gain is not measured (timing deferred).
The brief's earlier phone run of v2 (aw1-10e base, n = 3) had the y≈50 frame 48 → 35 ms.

## Before / after

No `fix.mjs ab` timing A/B (deferred by the user 2026-10-02). `results.json` holds the counts and pixel results.

### Pixel identity

**Chrome (gate: Chrome runs the baseline path).** Frozen-scroll parity, headless, arms C, C2 and V. Run par11:
mobile 430x932, phone 430x775, desktop 1440x900, 28 scroll positions each.
- Computed-style differences: 0 at every point.
- Pixel maxima per viewport equal the A/A maxima:

  | viewport | V max | A/A max |
  |---|---|---|
  | mobile | 254 | 255 |
  | phone | 21 | 21 |
  | desktop | 137 | 137 |

- At 7 points, V exceeded that point's single A/A sample; at many others the A/A exceeded V. Run par12 re-sampled
  those 7 positions (y50, 700, 767, 800, 839, 909, 982; all 3 viewports) with three A/A arms (C2, C3, C4 = st6-rb2,
  each vs C):
  - computed-style differences: 0 at every point;
  - max level: V never above the highest A/A arm at the same point (21 of 21); at 2 points (desktop y700 29,
    y982 1) V equals the highest A/A arm and exceeds a lower one;
  - pixel count: inside the A/A range at 20 of 21 points; desktop y50 V 73,970 px vs A/A 50,686-73,231 (1 % above,
    max 18 = A/A max 18). Its diff box reaches CSS y800, the A/A boxes end at y683; no PNGs were saved in par12,
    so the extra rows are not located. Chrome runs C's code path in V (gate false: no `.he-css`, no `.he-bob`,
    the CSS additions only match those). Run par13 re-shot that point with images (C, C2-C4, V):
    - The A/A arms fall into two whole-frame states: {C, C3, C4} and {C2}, 285k px apart (max 135, the orbit cards
      on both sides). V falls in C2's state (V vs C 284,904 px, C2 vs C 284,726 px).
    - Inside a state: C3 vs C 21.7k px max 4 (C4 vs C 37 px). V vs C2 22k px max 7, spread as speckle over one
      rotated photo card at the bottom right (CSS x 1080-1440, y 660-900), plus ~7k px max ≤ 7 on the copy and
      deck. No visible change (crop checked).
    - Open, OBSERVED (cause unknown): the 7-level speckle on that photo card exceeds the in-state A/A max of 4, with
      only one A/A sample of C2's state. On Chrome V computes the same styles as C (style diffs 0; no V rule
      matches), so only timing (load, larger CSS/JS files) can differ; it looks like resampling noise of a rotated
      image at a sub-pixel position. Re-shooting with more A/A arms would settle it.
  - So the par11 excesses fall inside the A/A spread once it has three samples: Chrome parity is 0 within A/A
    by max level at 21 of 21 points, and by pixel count at 20 of 21. The exception is desktop y50: a 7-level
    speckle on one photo card vs the same-state A/A, open and OBSERVED (above).

**WebKit (iOS 26.5 Simulator, frozen frames, timers cleared, document-timeline animations paused).** C and C2 are
both st6-rb2 (A/A); V is this build; VT is V with a finger down (touchstart) during the shot.

| position | V vs C | C2 vs C (A/A) | verdict |
|---|---|---|---|
| y0 | 2498 px, max 112 (cue) | 2494 px, max 106 | within A/A (V vs C2: 1969 px, max 6) |
| y171, y466, y570 (deck, copy, cue) | 0 px, except countdown digits | countdown digits | identical |
| y285 | copy ~1.1k px at max 1, plus ~150 px of max-1 bits; same at rest and finger down | 0 there | **residual R1** |
| y114-228 (deck edge cards) | ~200 px per side, max 11, in 1 of 3 sessions | C's own state differs between sessions | **residual R2** |

- **Countdown digits.** The countdown digits differ by clock time (shots taken seconds apart), in every arm pair
  including the A/A.
- **Hand-over frames (runs frz14, frz15; scratchpad `frzshot.mjs`).**
  - **Method.** The main thread is blocked from the next frame's rAF, so the screen keeps the frame under test
    while `simctl io screenshot` takes two shots 1 s apart. Every pair was still: 0 px.
  - **Setup.** Timers cleared, document-timeline animations (the bob) paused. The drop frame is triggered by a
    MutationObserver on the `.he-tf` removal; the re-add frame is the first frame after `scrollTo` 300 → 306.
  - "0 px" below means 0 outside the clock and countdown digits, which differ by load time in every pair,
    including C2 vs C.

  | frame | V vs C | note |
  |---|---|---|
  | drop (first frame after the 300 ms rest: class off, inline hold on) | 0 px vs C's frame with the same y300 values (+1 px max 1); same vs C2 | C's own rest state at y300 differs by R1, see Options |
  | re-add, armed (touchstart, then the first scrolled frame) | 0 px vs C one frame later (C's writer is one rAF late); vs C2: ~120 px max 1, the same bits as the C2 vs C A/A | C's own first frame is the stale y300 picture: ~510k px vs its next frame, cards up to 212 levels |
  | settled at y306 | 0 px | |
  | re-add, unarmed (no touch / wheel / key), before `heSc` | one frame: cards and opacity at y306, copy shift still at y300 (0.056 px); 51k px at max 26 levels on the copy text vs C one frame later | was residual R3; C's own first frame is stale on everything (~510k px) |
  | re-add, unarmed, with `heSc` (run sc16), from rest at y300 → 306 and from y0 → 6 | 0 px vs C one frame later, and vs C2 | R3 removed. Cost of that frame: S2 L3 P2 vs C's own scroll frame S2 L3 P3 |

  **Final build (run fin17, served JS `416e4a2ed34f`, CSS `fc83846a8755`, arms C and V):** drop, armed re-add,
  unarmed re-add and the frame after each: 0 px vs C one frame later (drop: vs C's stale first post-scroll frame,
  +1 px max 1), every still pair 0 px. Outside that, the only differences are the countdown digits, the status-bar
  clock and, new in this session, the title's rotating word ("あなた" in C's shots, between words in V's): ~41k px
  max 138 in every V vs C pair, and 0 between V's own frames. The rotator is st6-rb2's timer-driven word cycle,
  stopped wherever the timers were cleared, the same class as the countdown digits. In frz15 both arms stopped in
  the same phase (between words), and the title region was 0 px in V vs C (and C2 vs C) at the same frames: the
  word differs by the frozen timer phase, not by V.

### Hand-over cost (Simulator Timeline, run sim13, timers cleared)

Sequence: scroll 0 → 300, 1.2 s rest, touchstart, scroll 306, touchend. Per-frame Timeline records:

| frame | V | neighbours |
|---|---|---|
| drop (`.he-tf` off, ~300 ms after the scroll) | S2 L0 P0 | S1 L0 P0 |
| re-add (touchstart) | S2 L0 P0 | S1 L0 P0 |

Each hand-over costs +1 style recalc, 0 layout, 0 paint.
- **Copy transform values (getComputedStyle):**
  - across the drop: animation -2.807068 px, inline hold -2.807069 px, C -2.807069 px;
  - first frame of the next (armed) scroll: -2.86321 px, exact.
- **Logger caveat.** The logger's per-rAF `getComputedStyle` forces one recalc per frame in V while animations are
  live. Without the logger, the rest recalcs are equal to C (table above).

### Unarmed start (no touch, wheel or key; Simulator prearm.mjs, frame by frame)

| case | C | V before `heSc` | V (final, with `heSc`; run sc16 frozen frames) |
|---|---|---|---|
| from the top, first scrolled frame | whole frame one frame late (shift 0 at 122 ms, -2.807 at 177 ms) | copy shift one frame late (0 at 138 ms, -2.807 at 200 ms): **matches C** | first frame exact: 0 px vs C one frame later |
| from rest at y300 → 306 | whole frame one frame stale | copy shift one frame stale (0.056 px), cards/opacity current: **matches C** in timing, 51k px max 26 in pixels | first frame exact: 0 px vs C one frame later |
| armed (touchstart) | whole frame one frame late | first frame exact (y6 -0.056142 px, opacity 0.992982) | same |

## Options (residuals beyond A/A, for the user)

| id | where | pixels / levels | how long it shows | cause | options |
|---|---|---|---|---|---|
| R1 | y285 and y300 (y57, 114, 171, 228, 286, 342, 399, 466, 570: 0 px): copy text in two blocks [450,720 to 930,780] and [450,1080 to 870,1140] device px | ~1.2k px, max 1 level (+~150 px max 1) | while the page rests at such a position | **C shows the same difference between two of its own frames**: C at rest at y300 vs C's first frame after a scroll 300 → 306 (which still draws the y300 values, its writer is one rAF late) differ by exactly these pixels (630 + 537 px, max 1; same in C2). V at rest at y300 equals that C frame: 0 px outside the clock digits (frz14). So V draws one of C's own two raster states for the same values. Cause of C's two states UNRESOLVED (OBSERVED) | (a) accept as within C's own variation; (b) none found that makes V pick C's rest state |
| R2 | y114-228, the screen-edge deck cards (x 0-90 and 1200-1290, y ~2100-2190 device px) | ~200 px per side, max 11 | while resting in y114-228, in sessions where C clips | fact: in 1 of 3 Simulator sessions C (and C2) drew the card-corner shadow clipped hard to an axis-aligned box, and V drew it smooth. In the other 2 sessions C was smooth and V vs C = 0 | (a) accept: V is identical to C's smooth state; (b) reproduce C's clip in V (not attempted: it is C's own session-dependent state) |
| ~~R3~~ | removed by `heSc`: the unarmed first frame (was 51k px, max 26, one frame) | 0 px vs C one frame later (sc16) | | | |
| R0 | y0 cue | 2498 px max 112 vs C | at the top | within A/A (C2 vs C 2494 px max 106; bimodal cue state across sessions) | none needed |
| R4 (cost, not pixels) | at rest just past the hero end (y884), after a jump from y300 | 0 px; +15-20 paint records once (V 29-35 vs C 9-15 non-accent paints in the 5 s window, 4 sessions); none arriving from y600 | once per arrival, not per frame | single repaints of V's composited deck cards at their off-screen scatter positions and an earlier paint of the next section's cards; part may be the LayerTree census (UNRESOLVED) | (a) accept (one-off, off-screen layers); (b) drop the deck cards' layers past the end (a class toggle like `.he-tf`; untested, it would add a style change at the end) |
| C1 (Chrome) | desktop y50 | V vs same-state C2: 22k px max 7, speckle on one rotated photo card | at that frozen position | Chrome computes the same styles in V; only timing differs. In-state A/A max is 4 (one sample of that state). OBSERVED | (a) re-shoot with more A/A arms in C2's state |

## Cards (protocol v2)

**ST-1 (attribution split, Simulator, n = 2; the lead accepted it 2026-10-03 01:17Z as partly LOCATED).**
- H2a (an extra style/layout at the 0.72 flip): not supported. V has no more records than C at the flip, and about
  25 % fewer Layout / RecalculateStyles overall.
- H2c (≥3 more Paint records in the flip pair): not supported. 18 Paint records in V vs 23 in C.
- H2b (Composite): open. It needs the phone Timeline slot; Simulator compositing cost does not transfer.

**Build card (V).** The gate, the mechanisms, the counts and the pixels are above.
- Measurement code changed: none.
- a11y: no DOM change except the `.he-bob` span wrapped around the cue's label and arrow. Text nodes keep their
  references and their order; the span has no role.
- Memory and layers: see the counts table.

**Phone ticket (not run yet).**
- Driver: W.
- Order: C V V C, with an uncounted warm-up per arm port.
- Timeline on: the flip pair, the y≈50 frame, the hand-over frames.
- Builds: from immutable snapshot copies, with sha256 hashes as in `results.json`.
- To be requested from mgmt-ops-9 once the lead agrees on the residuals.

**Scenarios not run:**
- (idle after scroll is covered: the rest hold, Simulator counts and frozen frames above);
- reload while scrolled;
- early input during the desktop entrance: the JS path runs until `d()`, by design;
- scroll up: covered by the parity positions, not by a motion run;
- toolbar resize: `heArm` re-arms on `resize`, but not measured;
- rubber band;
- desktop Safari pixels: the Simulator is a phone, and Chrome takes the baseline path, so the desktop CSS rules
  are verified only by computed values in earlier parity, not by WebKit pixels;
- reduced motion: the CSS block applies under `prefers-reduced-motion: no-preference` only, and `heRest` returns
  under reduce.

## Risks, conflicts, follow-ups

- **cd-strip.** Its candidate brings back per-cell layers and 1-3 Paints per rolling digit. Under this fade, its
  current strip differs by 2-3 levels on glyph edges, and the candidate is identical (fix-cd-strip). Re-count the
  stack when its new patch lands.
- **HEflip / title accent.** While `.he-tf` is on (scrolling inside the range) the accent repaints like the
  transform-animated layer does. At rest the hold removes that. Coupling posted as F-150.
- **Nav morph F3.** No textual overlap: the nav `_` keeps its own rect read and the 0.72 flip.
- **Heavy layouts at rest at y300.** Present in both arms, not this topic (posted as F-159).
- **Pitfall for others.** `lock.mjs wait --until released-by:X` is a state check (F-161).
