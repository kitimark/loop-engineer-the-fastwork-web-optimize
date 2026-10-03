# Fix: hero-exit-threaded

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured by mechanism and pixels (no timing: timing A/Bs deferred, user 2026-10-02). Not ready to land:
the residuals in "Options" need the user's decision, and the phone Timeline attribution block (P-074, driver G,
gesture `gestures/hero-pass-v1.json`) has not run. Review round 2 (review-hero-exit, NEEDS-FIX on 66d2abe) is
answered in "Review round 2" below.
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
  `heCss`, `heTf`, `heRest`, `heOn`, `heTS`, `heTE`, `heWK`, `heSc`, `hePE`, `heWrap`, `heHold`, `heArm`, `heSync`.
  Mode switch in `d()` and `p()`, the `dE` callback, cleanup.
- `fixes/hero-exit-threaded/gestures/hero-pass-v1.json`: the WDA gesture of the phone attribution block (P-074).
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
- **iOS.** iOS browsers on WebKit (all of them outside the EU, and those that keep WebKit inside it) expose
  `GestureEvent`, so they get the CSS path when they support view timelines. Since iOS 17.4, browsers in the EU may
  ship another engine; those have no `GestureEvent` and keep the baseline writer (CONFIRMED: Apple, "Using
  alternative browser engines in the European Union", developer.apple.com/support/alternative-browser-engines).
- **Feature test.** The `CSS.supports` half requires view timelines with named ranges (Safari 26+; threaded on
  the compositor from Safari 26.4, WebKit blog post 17862, cited in the brief §0.3).
- **Untested slice: Safari 26.0-26.3.** The gate admits it, but there scroll-driven animations are updated on the
  main thread, not threaded, and their pending-frame behaviour may differ. Every WebKit result below is from iOS
  26.5 (Simulator) or 26.6.1 (phone).
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
   the frame the class arrived (Simulator, OBSERVED). Partly backed by source: on the threaded-animations path
   WebKit's `KeyframeEffect::canBeAccelerated` requires `!animation->pending()` (WebKit main,
   `Source/WebCore/animation/KeyframeEffect.cpp`, read by review-hero-exit 2026-10-03); the one-frame length is
   ours. So `.he-tf` is armed before the scroll:
   - on `touchstart` (the drag starts only after the touch slop);
   - on `wheel` and `keydown` (disarmed after 600 ms if the page stays at the top).

   A scroll with none of these (programmatic, scrollbar drag, find-in-page, status-bar tap) is caught by `heSc`
   (idea: lead). The `scroll` event fires before that frame's rendering update (CONFIRMED: HTML Standard, "update
   the rendering": "run the scroll steps" comes before "run the animation frame callbacks" and the style/layout
   update), so the handler writes the inline shift for the current `scrollY` (the rest-hold formula, from
   `scrollY`, no layout read), adds `.he-tf` and arms the rest timer. The animation's pending frame then draws
   the correct shift. Without it, that first frame drew the copy shift one frame stale (residual R3, removed; see
   the hand-over table). `heSc` listens on `window` in the capture phase, which also sees inner scrollers' scroll
   events, so it acts only on the document's own (`event.target === document`).
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
6. **Blur.** Blur is its own animation from `blur(0.009px)`. Past the end it keeps `blur(18px)` (fill forwards),
   like the baseline. At rest at the top no blur animation is active, and the filter is the baseline's own rule:
   `blur(0px)` on the desktop copy and cue and on the phone cue (the baseline computes `blur(calc(... *
   var(--exit-scatter) * 18px))` there, 0 at the top), none on the phone copy. Commit 66d2abe forced `filter:
   none` there instead, which differed from the baseline and flipped none → blur on every scroll from the top
   (review round 2, fixed). One flip stays: the phone's `.scroll-float`, which carries the cue's blur in V and has
   no filter in the baseline, goes from none to `blur(0.009px)` at the top crossing. Its frame cost is in "Review
   round 2" below.
7. **Switch frame (`heHold`).** The exit animations are created when `.he-css` arrives in `d()`, so they are
   pending in that first frame and the base values show. In the baseline the base values follow the inline
   `--exit-opacity`, so `d()` writes it once for the current scroll position (`s()`), keeps it through the first
   frame, refreshes it in the next rAF and removes it one frame later. A mid-hero switch then draws the exited
   hero, not the un-exited one: desktop Safari / iPad when `d()` fires 1.82 s after load while the page is
   already scrolled, a bfcache `pageshow` mid-hero, a restored scroll position. Without it (66d2abe) that frame
   showed the hero at full opacity, cards in place (review round 2, item 1).

The `dE` registration stays (the scene pause and render deferral are its side effects). In CSS mode its callback
does only `heTf()`: a `scrollY` read, plus a class write when the state changes (`classList.contains` first; 66d2abe
called `add` on every scroll frame).

## Why that is faster

On WebKit the exit no longer needs the main thread per frame. The animations follow the scroll position on the
compositor (threaded scroll-driven animations, Safari 26.4+, CONFIRMED in the brief §0.3). The JS rect read, the
custom-property write and the hero-subtree restyle are gone.

Simulator counts (OBSERVED, Simulator ms never count, F-084). The build column says which V each row measured:
"ST-1" = the D-stage build (before the rest hold and `heSc`), "rest" = with the rest hold, before `heSc`,
"416e" = the build of commit 66d2abe (JS `416e4a2ed34f`, CSS `fc83846a8755`). The review-round-2 build (below) changes
only the switch frame in `d()`, the at-rest filter value, and two listener guards; it is not re-counted here.

| | build | C (st6-rb2) | V | note |
|---|---|---|---|---|
| Layout records, 12 px stepped scroll y368→884 (2 runs) | ST-1 | 241 / 247 | 175 / 196 | ST-1 card |
| RecalculateStyles, same | ST-1 | 199 / 203 | 163 / 146 | |
| full-hero repaints, scroll phase y356→884 | ST-1 | 21 frames, 20.2 Mpx | 0, 6.8 Mpx total (-66 %) | |
| stacked on cd-strip (cb45b05) | ST-1 | 12.7 Mpx | 10.3 Mpx | the rest is the #people reveal |
| compositing layers | ST-1 | 128 | 134 | orbit-cards b, d, e, hero-copy, scroll-cue, scroll-float |
| layer memory | ST-1 | 122 MB | 112 MB | stacked: 123 vs 112 |
| style recalcs at rest, timers cleared, 4 s (y0 / y300) | rest | 0 / 29-33 | 0 / 31-35 | |
| all other paints in the 5 s window at y884, arriving from y300, with a LayerTree census before the window (sim10, sim13, fin17, acc19) | rest, 416e | 15 / 9 / 10 / 13 (C2 10) | 35 / 30 / 30 / 29 | caused by the census (next row) |
| same, **no LayerTree census** (acc20; y0 / y300 / y884) | 416e | 23 / 31 / 13 (C2 18 / 29 / 17) | 14 / 38 / 13 | y884: V = C; was R4, removed |
| same, arriving from y600 (acc18) | 416e | 12 (C2 16) | 14 | no burst |

Accent census (the title's script accent, 5 s at rest, timers on): accent paints / frames with 2+ accent paints.
The paint total is bimodal in C itself (C y884: 302/70 in sim10 and 290/64 in acc19, 185-199/15 in the other runs),
so totals alone don't separate builds. The 2+ frames do: V with `.he-tf` left on at rest (before the rest hold) has
109-129 of them; every other run, C or V, has 9-26 (except C's own 64-70 above).

| run | build | C y0 / y300 / y884 | V y0 / y300 / y884 | C2 |
|---|---|---|---|---|
| sim6 | before rest hold | - / 264/20 / 283/21 | - / 387/129 / 399/127 | |
| sim7 | before rest hold | 244/15 / 242/16 / - | 351/118 / 343/112 / - | |
| sim10 | before rest hold | 247/15 / 241/17 / 302/70 | 245/15 / 338/110 / 299/70 | |
| sim13 | rest | 193/15 / 202/12 / 192/15 | 189/15 / 207/12 / 189/15 | |
| fin17 | 416e | 192/15 / 206/11 / 185/15 | 190/15 / 207/11 / 185/15 | |
| acc18 (y600 / y884 / y1000) | 416e | 213/13 / 199/15 / 208/13 | 187/17 / 232/10 / 186/16 | 189/15 / 227/12 / 187/16 |
| acc19 | 416e | 240/11 / 187/16 / 290/64 | 188/17 / 211/11 / 184/15 | 194/14 / 197/12 / 193/15 |
| acc20 (no census) | 416e | 183/15 / 217/10 / 187/16 | 196/26 / 221/9 / 187/16 | 203/13 / 191/12 / 195/15 |

R4 (an extra paint burst at y884) came from the census, not from V. With a census, V's extra paints at y884 were
single paints (1-2 each in the window) of two things (acc19, paint rects):
- the deck cards at their scattered, off-screen end positions (x -251/-246 and 514/562, which only V draws as their
  own composited layers);
- the next section's card grid below the viewport (C paints the same grid rects once it reaches y1000, acc18).

That window started 1.5 s after the jump, right after a `LayerTree.layersForNode` census. Run acc20 repeated the
same sequence (y0 → y300 → y884, C, C2 and V in one Simulator session) **without** the census: at y884 V has 13
other paints, C 13 and C2 17. The burst is gone, so it came from the census (F-149: a layer census can itself cause
paints; OBSERVED in our setup, here for V's extra composited layers). Arriving at y300 from y0, V has 38 other
paints vs C 31 and C2 29 (one session, not followed up; the accent counts at y300 are 221 vs 217 / 191).

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

- At 8 points, V exceeded that point's single A/A sample; at many others the A/A exceeded V. Run par12 re-sampled
  7 of those positions (y50, 700, 767, 800, 839, 909, 982; all 3 viewports) with three A/A arms (C2, C3, C4 =
  st6-rb2, each vs C). The 8th, mobile y895 (V 7,037 px max 11 vs A/A 0 px), was missed there and is re-sampled in
  par15 (review round 2):
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
    - Run par14 re-shot desktop y50 with six A/A arms (C, C2-C6, all st6-rb2) and V, PNGs saved (scratchpad
      `pairmat.mjs`, `clusters.mjs`):
      - The A/A arms again fall into two whole-frame states, {C, C2, C5} and {C3, C4, C6}, ~285k px apart
        (max 135). V falls in {C3, C4, C6}.
      - V vs each arm of its state: 4,927 / 4,907 / 4,966 px, max 3. All of it lies in one box, the hero copy
        ([440,200]-[1000,720] CSS px): faint outlines of the copy's text, countdown boxes and buttons. Only at 20x
        amplification is anything visible. Plus 34 px max 1 below the buttons.
      - In-state A/A: {C3, C4, C6} 35-103 px, max 2-3. {C, C2, C5} 4,089-7,303 px, max 3-7, in the same hero-copy
        box with the same outline pattern (C2 vs C 7,292 px, max 7; crops `par14-crop-V-C3.png`,
        `par14-crop-C2-C.png`, gitignored `out/hext/`).
      - par13's photo-card speckle does not recur: V vs its state has 0 px at CSS x 1080-1440, y 660-900.
      - So V's diff at desktop y50 is the kind of diff A/A arms in one state show among themselves, at a lower level
        than the highest such A/A pair (V max 3 vs 7; V 4.9k px vs 7.3k px). C1 is closed: within A/A (OBSERVED,
        cause of the copy-outline variation unknown; it occurs between identical builds).
  - So the par11 excesses fall inside the A/A spread once it has enough samples: Chrome parity is 0 within A/A
    by max level at 21 of 21 points. By pixel count it is within A/A at 20 of 21 in par12; the 21st point,
    desktop y50, is within the six-arm A/A spread in par14.

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

### Review round 2 (review-hero-exit NEEDS-FIX on 66d2abe; build JS `301ec740291b`, CSS `55ba45f138c9`)

Code changes: `heHold` (mechanism 7), the at-rest filter back to the baseline's rules (mechanism 6), `heTf` writes a
class only when its state changes, `heSc` checks `event.target` and arms the rest timer (mechanism 2). Checks on this
build (Simulator iOS 26.5 functional sessions unless named; scratchpad `rev2.mjs`, `tb.mjs`, `rl.mjs`; frozen frames as
above, title word synced to the same drawn word in every arm before timers are cleared):

| item | check (run) | result |
|---|---|---|
| 1 switch frame mid-hero | restore at rest y300 that re-creates the animations: drop `he-css`, two frames, then `pageshow` (persisted) → `p()` + `d()`; freeze the frame after `d()` (r2h, arms C, V, V0 = 66d2abe) | V vs C: countdown digits only (V holds `--exit-opacity` 0.649 inline in that frame, as designed). **V0 vs C is also clean** (digits, clock): on the Simulator the new animations' pending frame did not show base values here, so the probe does not reproduce the flash the review predicted; `heHold` stays as a guard (it is what the review's source reading, `canBeAccelerated` / `pending()`, calls for). OBSERVED |
| 1 (other probes) | synthetic `pageshow` without dropping the class (r2b); reload while scrolled (r2f, r2g) | r2b: V = V0 = C (no animation is re-created when `p()` and `d()` run in one task). Reload: `d()` had already switched (`he-css` on 0.9 s after the reload, while Safari was still restoring the scroll, y121) before a watcher could attach; a bootstrap-script watcher did not fire. Not captured |
| 2 collapsed toolbar | WDA collapse stroke (innerHeight 775 → 815), then y150 / 230 / 300 / 500 / 700 / 840 (r2e) | V's copy opacity = C's = `1 - p` with innerHeight 815 at all 6 points (difference ≤ 1e-6) |
| 3 filter at rest | top crossing y0 → 6 → 12, Timeline records per frame, timers cleared (r2c) | the one remaining flip (phone `.scroll-float`, none → `blur(0.009px)`) costs nothing extra: V's first frame from the top S1 L2 P55 vs C's per-step frame S1 L1 P54; V's later steps P0-1, C repaints P54 on every step |
| 4 hand-over frames, same word | drop, armed and unarmed re-add, settle at y300/306 (r2a) | drop and settle: 0 px outside clock and digits. Re-add: V's frozen frame = C's own settled y306 frame (0 px outside the digits); C's frozen frame there is still its y300 frame (= C's drop frame, ±1 level), as in frz14: C draws the scroll one update later |
| 4 (y0) | settled y0, C, C2, V (r2d) | V vs C = C2 vs C: the title accent phase and the digits only. r2b's extra card-band diff at y0 (V and V0 both vs C, max 45) was C's own session state: none in r2d |
| 5 accent census | acc20 (above) | R4 removed |
| 6 jump back into the hero | from rest at y3000, `scrollTo(300)`: first and second frame (r2b) | V vs C: browser chrome only (clock, back button). V0 (66d2abe) vs C, second frame: 460k px |
| Chrome parity, new build | par15: mobile, phone, desktop × y50 / 895 / 909; C, C2-C4, V | computed-style diffs 0 everywhere. Max level within the A/A arms at 8 of 9 points. Mobile y909: V 7,110 px max 53, A/A there ≤ 919 px max 1; the same 53-level whole-frame pattern (same box) is C2 vs C at y895, i.e. the two Chrome raster states seen in par13/par14; Chrome runs C's code path in V (gate false). The y895 re-sample owed from par11: V 1,947 px max 1, within (C2 6,142 px max 53) |
| functional | `fix.mjs check --viewport both` (headless Chrome) | ok: morph reached, 0 errors, 0 4xx; screenshot diff 0-0.12 %. The +174 elements are st6-rb2's (start-selling morph, st5 images), not this topic |

Still untested: desktop Safari and iPad (viewport > 600 px: the Simulator is a phone, so the desktop CSS rules and the
desktop `heRest` formula have computed-value parity only); Safari 26.0-26.3 (gate slice above).

## Options (residuals beyond A/A, for the user)

| id | where | pixels / levels | how long it shows | cause | options |
|---|---|---|---|---|---|
| R1 | y285 and y300 (y57, 114, 171, 228, 286, 342, 399, 466, 570: 0 px): copy text in two blocks [450,720 to 930,780] and [450,1080 to 870,1140] device px | ~1.2k px, max 1 level (+~150 px max 1) | while the page rests at such a position | **C shows the same difference between two of its own frames**: C at rest at y300 vs C's first frame after a scroll 300 → 306 (which still draws the y300 values, its writer is one rAF late) differ by exactly these pixels (630 + 537 px, max 1; same in C2). V at rest at y300 equals that C frame: 0 px outside the clock digits (frz14). So V draws one of C's own two raster states for the same values. Cause of C's two states UNRESOLVED (OBSERVED) | (a) accept as within C's own variation; (b) none found that makes V pick C's rest state |
| R2 | y114-228, the screen-edge deck cards (x 0-90 and 1200-1290, y ~2100-2190 device px) | ~200 px per side, max 11 | while resting in y114-228, in sessions where C clips | fact: in 1 of 3 Simulator sessions C (and C2) drew the card-corner shadow clipped hard to an axis-aligned box, and V drew it smooth. In the other 2 sessions C was smooth and V vs C = 0 | (a) accept: V is identical to C's smooth state; (b) reproduce C's clip in V (not attempted: it is C's own session-dependent state) |
| ~~R3~~ | removed by `heSc`: the unarmed first frame (was 51k px, max 26, one frame) | 0 px vs C one frame later (sc16) | | | |
| R0 | y0 cue | 2498 px max 112 vs C | at the top | within A/A (C2 vs C 2494 px max 106; bimodal cue state across sessions) | none needed |
| ~~R4~~ | removed: the extra paint burst at y884 came from the LayerTree census (acc20 without it: V 13 = C 13, C2 17) | | | | |
| ~~C1~~ | closed: desktop y50 on Chrome is within the six-arm A/A spread (par14: V vs same state max 3, 4.9k px; same-state A/A up to max 7, 7.3k px, same hero-copy box) | | | | |

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

**Phone ticket P-074 (not run yet; a Timeline attribution block, not a gain block).**
- Driver: G, gesture `gestures/hero-pass-v1.json` (two drags up through the hero with rests, two drags back).
- Order: one uncounted warm-up per arm port, a Timeline-OFF sentinel, then C V V C with Timeline on, end sentinel.
- Scored by mechanism, not time: share of moving hero-band frames that run the JS writer `s` (C) / none (V), the
  hand-over frames (touchstart, rest drop) against C's same-phase frames, the y≈50 frame. Scorer, ranges and void
  rules are registered in `fixes/PREDICTIONS.md` before any data.
- Builds: immutable snapshot copies of this build (JS `301ec740291b`, CSS `55ba45f138c9`) and st6-rb2.

**Scenarios not run:**
- (idle after scroll is covered: the rest hold, Simulator counts and frozen frames above);
- reload while scrolled: tried (r2f, r2g), not captured, `d()` switches about 0.9 s after the reload, before a watcher can attach (item 1 above);
- early input during the desktop entrance: the JS path runs until `d()`, by design;
- scroll up: covered by the parity positions, not by a motion run;
- toolbar resize: values checked with the toolbar collapsed (r2e, equal to C), the resize moment itself not captured;
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
