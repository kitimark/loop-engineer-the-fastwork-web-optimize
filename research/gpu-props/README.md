# GPU/compositor-only CSS for this page's animations (T-030)

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). This
> README quotes class names and line numbers of the frozen baseline (`site-pretty/`, snapshot pinned by
> `baseline.json`); keep it on local branches, never push.

Owner: de-gpu (research engineer), 2026-10-03. User thread T-030 (and T-024 #8 for the countdown section).
Counts only: no timing A/B, no phone, no MCP performance tools (project direction since 2026-10-02 02:27 +07).
Line numbers are 1-based in the prettified baseline unless a source file of Chromium/WebKit is named.

## In plain words

- Only a few properties can be animated by the GPU alone, with no main-thread work per frame: `transform` (and
  `translate`/`scale`/`rotate`), `opacity`, `filter` (not blur in Chrome), `backdrop-filter`. Both engines agree on
  those. Chrome also does `background-color` and `clip-path` on the GPU; Safari does not.
- Most of this page's CSS animations already use those properties. The ones that don't are the four "sweep" titles
  in the platform section, the SVG line drawings and dash packets, a mask wipe on the nav button at load, the
  avatar carousel and some layout transitions. About half of the platform-section animation CSS never runs on
  this page at all: the HTML for it is not there.
- On today's best build (st6-rb2), what keeps the page drawing a new frame every vsync while nobody scrolls:
  the countdown at the top (script), typing and counting effects in the middle (script), and in the platform
  section exactly two things, the sweep titles and a small SVG glint on the "secure" picture. Pausing those two
  makes the platform end of the page fully idle in Chrome (120 frames per 2 s to 5).
- **Finger scroll on st6-rb2 (section 0, the lead's C-026 question).** The remaining long frames sit in two
  places: the first ~1000 px (hero exit, #people entry: 63 of 81 long moving frames) and the morph at the
  bottom while the finger holds the page there (91 long frames, not in the "moving" count at all). The Safari
  toolbar resizing is not the cause: mid-page toolbar transitions run at 13-18 ms frames. Safari's own work per
  toolbar frame is real (it re-lays out every fixed/sticky box and re-checks every vh/svh/dvh style; CONFIRMED in
  WebKit's source) but small on this page.
- Fix candidates for the finger feel, ranked (section 6): (1) `cd-strip`: the countdown digits as one pre-drawn
  strip each, identical by construction; it removes Safari's digit repaints, which an earlier analysis named as
  the morph's slow-frame cost, in both clocks (hero and morph panel); (2) `hero-exit-threaded`: the hero exit as a
  scroll-driven CSS animation, which Safari 26.4+ (the phone has 26.6.1) runs off the main thread (CONFIRMED); it
  was built before and matched the original on the phone, but it added ~11 ms to one frame at y≈700 for a reason
  not yet named, so a Timeline split comes first; (3) `cd-roll-ca`: the countdown roll as a GPU animation,
  the biggest script saving at the top and in the morph, but not frame-for-frame identical: the user decides.
- Idle-cost candidates (no effect on finger lag, battery and heat only): the platform glint and the sweep titles
  (`glint-ca`, `sweep-exact`).

## 0. Finger scroll on st6-rb2: what is left, and can the GPU take it? (lead request, C-026)

Data: iphone-runner's C-026 blind finger pair (F driver, single runs, not a counted block; iPhone 15 Pro Max,
iOS 26.6.1), `out/swipe31/C-26-p1-a1.json` (Original) and `C-26-p2-a1.json` (st6-rb2) in its worktree, frames
`[t, dt, scrollY, innerHeight]`. Scripts: `<scratchpad>/gpu-props/swipe{,2,3,4}.mjs` (scratch, not committed).
All numbers here: OBSERVED, n = 1 run per arm, finger driver (fps and counts compare only with F runs).

### 0.1 Where the long frames are

| frames (dt > 34 ms / > 50 ms) | Original | st6-rb2 |
|---|---|---|
| moving, y < 1000 (hero exit, #people entry, nav pill drop) | 56 / 16 of 280 | **63 / 9** of 522 |
| moving, y 1000-5000 | 45 / 20 of 572 | 17 / 3 of 313 |
| moving, y ≥ 5000 | 21 / 8 of 92 | 1 / 1 of 60 |
| held at the end pin (y ≥ 5200, finger drives the morph) | 52 / 14 of 337, median 17 ms | **91 / 12** of 813, median 20 ms |
| held at the top or elsewhere | 26 / 4 | 2 / 0 |

(The "moving" rows add up exactly to the lead's whileScrollYChanges counts.) st6-rb2 has cleared
the middle and the bottom of the page. What the finger still feels is (a) the first ~1000 px and (b) the morph at
the end, which the moving-frame count does not include at all: at the pin st6-rb2's median frame is 20 ms, so the
morph runs below 60 fps for as long as the finger holds it (this run held it 2.4x longer than the Original run did).

### 0.2 The toolbar resize: real work in WebKit, not the cause here

What WebKit does on each frame of a toolbar transition (CONFIRMED, WebKit safari-7624-branch `0f8c6795`):
- the UI process sends a new layout viewport; its size is `max(base size, unobscured size)`, so it grows and shrinks
  with the toolbar (`LocalFrameView.cpp` l.1837-1858, `computeUpdatedLayoutViewportRect`; `WebPageIOS.mm`
  l.5253-5289, `updateVisibleContentRects`);
- a height change always triggers layout work, even mid-gesture: "Triggering layout on height changes is necessary
  to make bottom-fixed elements behave correctly" (`LocalFrameView.cpp` l.1951-1964, `setLayoutViewportOverrideRect`):
  - every `position: fixed` **and** `position: sticky` renderer gets `setNeedsLayout` plus a compositing geometry
    update (l.3619-3631; `RenderStyle+GettersInlines.h` l.849-852 `hasViewportConstrainedPosition` = fixed or
    sticky; `RenderLayerModelObject.cpp` l.195-202);
  - `Document::updateViewportUnitsOnResize` → `Style::Scope::didChangeViewportSize` walks the **whole DOM** and
    invalidates the style of every element whose style uses **any** viewport unit (`vh`, `svh`, `lvh`, `dvh` alike;
    `StyleScope.cpp` l.885-920; `Document.cpp` l.5905-5908);
- the resize event goes out when the change is not interactive (`WebPageIOS.mm` l.5288-5289).

What on st6-rb2 depends on the viewport height (CSS `2.gBuqKVzi.css` of the st6-rb2 overlay, JS `nodes/2.DyWL8TcE.js`):
- fixed/sticky renderers: the nav pill and morph panel (fixed, CSS 10565, 11450), `.hero` (sticky, `100svh`,
  1570), `.pain-sticky` (2332), `.start-selling-profile-sticky` (3340), `.why-bring` (fixed `inset: 0`, 698; a
  closed overlay), `.commission-sticky` (desktop only);
- 28 viewport-unit declarations, among them `.hero-track` `200vh` (1556), `.hero` `100svh`, the deferred sections'
  `contain-intrinsic-block-size: auto var(…, 100vh)` (11920), and on phones `--panel-h: calc(100dvh - 40px)` for
  the morph (11177, inside the `width<=860px` block at 11090). The panel's height is
  `pill + (panel − pill) × --morph` (10553, 11435), so **while the morph is open the panel re-lays out on every
  toolbar frame** (`dvh` follows the layout viewport, `LocalFrameView.cpp` l.6954-6960);
- JS: one `resize` listener, the scroll engine's `rE` (2728), which only schedules the same rAF the scroll already
  scheduled; the callbacks read `innerHeight` (hero exit 4397, nav 13278, future 11547, morph `visualViewport` 13322).

What the data says (OBSERVED): in the Original run, the five toolbar transitions in the middle of the page (y 3462→3938,
4685→4234, 5077→4721, 4467→4454, 4460→4480) ran at 13-18 ms frames, with at most three frames of 20-33 ms per
transition and none over 34 ms, while `innerHeight` changed on every frame. Long frames do cluster near toolbar changes at y < 1000 (st6-rb2: 25 of 29 long frames at y < 500
are within one frame of an `innerHeight` change), but that is where the hero exit runs and where every swipe starts,
so position explains it better than the toolbar. One st6-rb2 transition did have long frames (y 5062→4673, 84/66/42 ms):
it is the scroll back up from the pin while the morph closes, i.e. the panel-`dvh` case above (n = 1).

Verdict: not a fix candidate now. A compositor-only alternative does not exist for this part, because the work is
WebKit's own response to a viewport change. The page-side levers are fewer fixed/sticky renderers (e.g. `.why-bring`
`display: none` while closed) and no `dvh` on the open panel (`lvh` would leave the panel's bottom under the toolbar:
a visual change, so not identical). Decisive check if it is ever needed: a Simulator/phone Timeline over one toolbar
transition at mid-page, counting Layout and Recalculate Styles records per frame.

### 0.3 The remaining main-thread costs in a finger scroll, and what the GPU can take

From the C-026 split above and the two post-mortems (`research/design-engineering/postmortem-hero.md`,
`postmortem-morph.md`): long WebKit frames here are a whole-view Layout (12-16 ms, from "presence flips": opacity
crossing 1, filter/transform to or from `none`) plus a 17-24 ms Composite (layer or backing-store changes, digit
repaints). Ranked by long frames involved (judgement from positions and the post-mortems; no Timeline split of
st6-rb2's finger frames yet):

| # | cost | where | GPU-friendly removal | identical? | status |
|---|---|---|---|---|---|
| 1 | countdown digit faces repaint on every spring frame. The morph post-mortem named this the Composite term of the morph's slow frames (~80-100 small face layers repainted, build g). st6-rb2 un-layers the panel faces (cdwc), so there each spring frame now repaints the digit area inside the panel's layer instead; st6-rb2 does not include countdown-faces | morph panel clock (end pin, 91 long frames) and hero clock (y < 900) | **cd-strip** (G2): a static strip per digit, only its transform changes; no text change, never outside the clip, so no repaint and no backing re-attach (F-142) | yes, by construction | ready (brief G2) |
| 2 | hero exit: per-frame rect read + `--exit-opacity` write on `.hero` → hero subtree restyle, blur/opacity updates | y 0-855 | **hero-exit-threaded**: the exit as `animation-timeline: view()` (topic 7 v2, FINDINGS T12); Safari 26.4+ runs scroll-driven animations on the compositor thread (CONFIRMED below) | as a function of scroll position (phone parity at 26.6.1 measured by fix-hero-exit: copy opacity .901/.501/.03, cue blur 1.78 vs 1.79 px) | needs ST-1 first (brief S1) |
| 3 | countdown spring script, ~30 rAF/s per clock during each 0.5 s roll | both clocks | **cd-roll-ca** (G4): roll as a WAAPI transform animation | no (frame-sequence dependent), user decision | brief G4 |
| 4 | presence-flip layouts at the #people reveal and its ends | y≈600-750, flip + 0.75/0.95 s | already owned (hero-exit ST-2, re-keep-op): keep animated endpoints at `opacity: .999`, `blur(0)`, `translate(0)` | yes | owned, not mine |
| 5 | avatar carousel exit `clip-path: ellipse()` every ~1 s | #people | none: an ellipse that narrows has no transform/opacity equivalent; WebKit ticks clip-path on the main thread for 0.22 s | n/a | not a candidate |
| 6 | toolbar transitions | everywhere | none (0.2) | n/a | not a candidate |

Threaded scroll-driven animations, CONFIRMED:
- WebKit blog, "WebKit Features for Safari 26.4" (webkit.org/blog/17862): "Safari 26.4 adds support for threaded
  Scroll-driven Animations … run on the compositor thread";
- source, safari-7624-branch: `ThreadedScrollDrivenAnimationsEnabled` is `stable`, default on for WebKit
  (`UnifiedWebPreferences.yaml` l.8315-8328); `ENABLE_THREADED_ANIMATIONS` is 1 on every Cocoa platform but old macOS
  (`PlatformEnableCocoa.h` l.934-936); `ThreadedTimeBasedAnimationsEnabled` stays off (l.8339-8352);
- on that path `KeyframeEffect::canBeAccelerated` returns before the `steps()` / `linear(…)` checks
  (`KeyframeEffect.cpp` l.1951-1954 inside `canBeAccelerated` l.1926, `canHaveAcceleratedRepresentation` l.3135-3146), so scroll-driven animations
  with those easings are accelerated too, unlike time-based ones; the timeline needs a scrolling node
  (`ScrollTimeline.cpp` l.416-426: the root scroller has one);
- custom properties are still never accelerated (`StyleInterpolation.cpp` l.254-264): the keyframes must animate
  the real properties (FINDINGS P3).

## 1. Method and data

| step | what | where |
|---|---|---|
| source reading | Chromium `compositor_animations.cc`, `animation.cc`, `smil_time_container.cc` at HEAD `ebb14bcc68734d5550b384d15484edf70e5496a0` (ls-remote, read 2026-10-03); WebKit `KeyframeEffect.cpp`, `CSSProperties.json`, `RenderLayerCompositor.cpp`, `GraphicsLayerCA.cpp`, `PlatformCALayerCocoa.mm`, `SMILTimeContainer.cpp` at safari-7624-branch `0f8c6795eafb755b6c7480d2a57305315fd40ae4` (iOS 26.x) and main `814cfe09` | links in the tables |
| static audit | every `@keyframes`, `animation`, `transition` in the four CSS files; every `requestAnimationFrame`, SMIL and `.animate(` in `nodes/2.DyWL8TcE.js`; each animated class checked for a JS reference | `out/gpu-props/audit.json` (gitignored) |
| matrix | Chrome 154.0.8037.97 headless, a synthetic page with one element per property/easing; Blink's own decision (`Animation` trace event, `compositeFailed` bit mask) | `tools/comp-census.mjs --matrix-only` |
| page census | baseline and st6-rb2 (JS `7bf7c4657d21`, CSS `f523598b2a24`, immutable copy), 430x932 DPR 3 mobile + touch, CPU 1x, 7 scroll stops 932 px apart, at each stop 2 s idle windows: as is (`idle`), with every running non-transform/opacity animation paused (`a1`), and with SMIL paused too (`a2`); trace event counts per window | `tools/comp-census.mjs --ablate --no-matrix` |

All census numbers are OBSERVED, Chrome 154 headless at 60 Hz, n = 1 per stop, in our setup. They are counts, not
times. Pausing an animation can also stall script that waits for its `animationend` (the avatar carousel), so an
ablation drop says "this was needed for those frames", not "this alone costs them".

Holds: shared lane, `--weight probe`, 2026-10-02 23:19Z (census 1), 23:24Z (matrix), 23:27Z (ablation, both builds).

```sh
# one shared hold, servers started inside (hold script: out/gpu-props/hold2.sh)
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner de-gpu -- sh out/gpu-props/hold2.sh
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner de-gpu -- \
  node research/gpu-props/tools/comp-census.mjs --matrix-only --out out/gpu-props/matrix.json
```

## 2. Reference table: what runs without the main thread

Chrome = Blink/cc 154. WebKit = iOS Safari 26.x (safari-7624-branch). "Compositor" means the effect runs with no
per-frame main-thread work once started.

| property / kind | Chrome | WebKit (iOS 26.x) | status, reference |
|---|---|---|---|
| `transform` | compositor | compositor (Core Animation) | CONFIRMED. Chrome: `compositor_animations.cc` l.78-84 (compositable list), matrix: composited. WebKit: `CSSProperties.json` `"animation-wrapper-acceleration": "always"` for transform |
| `translate` / `scale` / `rotate` | compositor | compositor | CONFIRMED, same lines; matrix: composited. WebKit treats them as separate CA transforms (F-075/F-102: no Layout diff, unlike `transform: none`↔some) |
| `opacity` | compositor | compositor | CONFIRMED, same. On WebKit, opacity crossing 1 is a Layout diff (F-075/F-102, CONFIRMED there) |
| `filter` | compositor **except blur/drop-shadow/reference filters**: any keyframe that moves pixels sets `kFilterRelatedPropertyMayMovePixels` (1<<12) and the whole effect stays on the main thread | compositor (filter list includes blur); a `url()` reference filter is refused (`KeyframeEffect.cpp` l.1926-1968) | CONFIRMED. Chrome: `compositor_animations.cc` filter check; matrix: `blur(0)→blur(8px)`, `none→blur`, `opacity+blur` all fail 4096, `brightness()` composites. WebKit: `CSSProperties.json` always; F-140 |
| `backdrop-filter` | compositor (exempt from the moves-pixels rule) | compositor | CONFIRMED; matrix composited; `CSSProperties.json` |
| `background-color` | compositor via native paint worklet (flag stable at HEAD; monotonic timelines only) | main thread | CONFIRMED Chrome: `background_color_paint_definition` path + matrix composited. WebKit: not in the acceleration list |
| `clip-path` | compositor via native paint worklet (same conditions) | main thread | CONFIRMED same way (matrix: `inset()` composited) |
| `offset-*` (offset-path, offset-distance) | main thread (`kUnsupportedCSSProperty`; with `offset-path` on the target also `kTargetHasCSSOffset`) | "threaded-only": accelerated only on the threaded-animation path, which is off for time-based animations in 7624 (oss-rendering-libs §1.3); `offset-path` on a target also blocks accelerated transform animations there (`KeyframeEffect.cpp` preventsAcceleration l.1983-2006) | CONFIRMED; matrix fails 8352 |
| custom properties (`@property`, `--x`) | main thread unless read only by a CSS Paint worklet | never accelerated (`StyleInterpolation.cpp` l.254-264) | CONFIRMED; matrix fails 8192 |
| `background-position`, `mask-position`, `width`/`height`/`gap`/margins, `stroke-dashoffset`, colours | main thread (style + paint, layout for geometry) | main thread | CONFIRMED (matrix fails 8192/8224 with the property named); stroke-dashoffset is also a WebKit Layout diff (F-097) |
| percentage transforms | compositor (`box_size` used, l.1027) | compositor, except when the same effect also animates size (size-dependent transform + size refused, l.1926-1968) | CONFIRMED; matrix `translateX(50%)` composited |
| easing `steps()` | compositor | **main thread** (steps refused in canBeAccelerated) | CONFIRMED (F-048/F-065; matrix composited in Chrome) |
| easing `linear(…)` with points | compositor | **main thread** (linear() with points refused) | CONFIRMED (same lines; F-080: freezes during main-thread blocks on the phone) |
| keyword `linear`, `cubic-bezier()` | compositor | compositor | CONFIRMED |
| mixed keyframes (one non-compositable property) | **whole effect** on the main thread | the accelerable subset stays accelerated, the rest ticks on the main thread (`KeyframeEffect.cpp` l.1710-1731) | CONFIRMED |
| `endDelay` ≠ 0, non-replace composite | refused (ConvertTimingForCompositor l.780+) | non-replace composite refused | CONFIRMED |
| scroll-driven (`animation-timeline: scroll()/view()`) | compositor if the scroller is composited (`animation.cc` l.2557-2566); matrix composited | main thread on 26.x legacy path; threaded scroll-driven animations from Safari 26.4 (WebKit blog post 17862) | CONFIRMED |
| CSS transitions vs CSS animations vs Web Animations (`element.animate`) | same machinery, same rules (matrix: WAAPI transform and an opacity transition composited) | same rules | CONFIRMED |
| rAF-driven style writes (any property) | main thread every frame by definition | main thread every frame | CONFIRMED (HTML "run the animation frame callbacks") |
| SMIL (`<animate>`) | main thread: requests a main frame every frame while visible (`smil_time_container.cc` l.372-392, 461-466) | main thread: a 1/60 s WebCore Timer (`SMILTimeContainer.cpp` l.42, 196-216, 261-316) | CONFIRMED |
| `will-change: transform/opacity` | creates a composited layer up front | composites, **except** under iOS's conservative compositing policy, which may ignore it (`RenderLayerCompositor.cpp` l.3977+, rdar://71881767) | CONFIRMED |
| implicit promotion | a running composited animation promotes its target; overlap promotes siblings | an animation composites its target (l.3813); any `filter` (even `blur(0)`) or `backdrop-filter` composites (l.3961); overlap promotes indirectly (l.1318-1342) | CONFIRMED |
| reduced motion | composited animations disabled under the reduce-motion policy | CSS rules on this page switch most animations off | CONFIRMED (Chrome source); page CSS read |
| WebKit layer backing outside a clip | n/a (Chrome rasterizes only visible tiles) | a composited layer that does not intersect its coverage rect has its backing store **detached**; on re-entry it repaints; a running CA transform animation keeps it attached via its animation extent (`GraphicsLayerCA.cpp` l.1871-1897, 3034-3058; `PlatformCALayerCocoa.mm` l.728-739) | CONFIRMED by source; F-142 |

What breaks compositor-only animation on this page specifically: blur keyframes in Chrome (12 entry keyframes, F-140),
`steps()` on WebKit (the boil and caret loops, owned by illusion-boil-ca), `linear()` on WebKit (owned by
blur-cubic), mixed keyframes with geometry (`avatars-exit`, `people-o-peel`), and anything SMIL or rAF-driven.

## 3. Audit of this page

### 3.1 Live animations (rendered by this build)

"Chrome"/"WebKit": compositor (C) or main thread (M). "Run": when it runs. Owner: a topic that already changed or
studies it.

| animation | property | Chrome | WebKit | file:line | run | owner / already changed | GPU rewrite, identical? |
|---|---|---|---|---|---|---|---|
| countdown digits (hero + panel) | rAF spring writes `translateY` per face | M (per frame) | M | JS 3791-3876 (`GE` 3791, `KE` 3804, `$E` 3823; transform 3862) | 1 Hz, ~0.5 s per roll, never stops | countdown-faces (80→24 faces, hidden skip), countdown-ca, cdwc (panel faces unlayered) | yes: **G2** strip (identical), **G4** CA roll (not frame-identical) |
| accent word draw | `stroke-dashoffset` (3 paths), `width` transition | M | M (Layout diff, F-097) | CSS 1277-1282, 1231 | cycle ~4.3 s at the hero | layout-animations (width → FLIP), illusion-accent-frames (closed: keep SVG), illusion-accent-wipe (proposal) | no (owned) |
| accent/underline/zero "boil" | `opacity`, `step-end` | C | **M** (steps) | CSS 1292-1299, 166-172, 674-681 | infinite | illusion-boil-ca | owned |
| carets (`typing-caret`, ask caret) | `opacity`, `step-end` | C | **M** (steps) | CSS 461, 9095 | infinite while shown | illusion-boil-ca | owned |
| scroll cue float | `transform` | C | C | CSS 1946 | infinite | none needed | already GPU |
| vinyl spin | `transform` | C | C | CSS 3850 | infinite | r3b-vinyl-wc (F-041: inside a `mask-image` ancestor) | already GPU |
| avatar carousel (st6) | baseline: `width`/`flex-basis`/`margin`/`border-width` + opacity/transform; st6: `clip-path`/`translate`/opacity/transform | baseline M; st6 C (clip-path via worklet) | baseline M; st6: clip-path M, rest C | CSS 2883-2905 | ~1 Hz at #people | hero-carousel (st6, phone Gain S7) | done |
| doc-sweep titles ×4 | `background-position` on `background-clip: text` | M | M | CSS 5707/5769/5846/5907/5954/11103, keyframes 5802 | infinite, now only in view (PMsweepGate) | layout-animations (gate), illusion-sweep (darken, not identical) | **G3** (identical to ±1 LSB, WebKit UNRESOLVED) |
| secure-network dash glint ×2 | SMIL `x1`/`x2` on a `linearGradient` | M | M | JS 12151-12285 (`DM`, `OM`, `NM`) | 5 s loop while ≥35 % visible | none | **G1** (identical by construction) |
| secure-network entries | opacity/transform | C | C | CSS 7045-7075 | once per entry | none | already GPU |
| cred/profile/invoice entries | `filter: blur()` + opacity + transform | **M** (blur) | C | CSS 6516, 7512, 8577 | once per entry | large-area-blur, re-keep-op, blur-cubic | no identical blur-free form; Chrome-only cost (F-140) |
| cred / reviews marquee | `transform` | C | C | CSS 6477, 7497 | 90 s infinite | none needed | already GPU |
| morph column marquee | `transform` | C | C | CSS 10581-10584 | 16 s infinite (panel) | none needed | already GPU |
| nav "earn" unmask + sheen | `mask-position` (+ transform sheen) | M | M | CSS 11535, 11543 | once, 0.98 s at load | none | geometry-identical via counter-translated wrapper; mask resampled at fractional offsets; load only: **not ranked** |
| hero copy/cue entrance | registered `--copy-in` | M | M (never accelerated) | CSS 1742, 1919, 1928 | once at load | hero-exit | rewrite as opacity/transform keyframes is identical only if every use is linear in `--copy-in`; load only: not ranked |
| hero CTA orbit | `--hero-orbit-angle` | — | — | CSS 1866 | **never** (target is `display: none`, F-015) | main-thread-infinite-animations | dead |
| fee progress count-up | rAF `width` | M | M | JS (commission block) | once per commission loop | layout-animations | owned |
| referral / agents typing | text writes every 28/32/18 ms | M | M | JS (see illusion-typing-chunks) | loops while in view | illusion-typing-chunks | not a CSS property question |
| layout transitions: `gap` (profile chrome 2928, nav actions 11444), `grid-template-rows` (platform row 6294), nav `width`/`max-width` | geometry | M | M | as listed | on triggers | nav cluster, scene-scope | FLIP gives the same geometry, not the same raster mid-motion (text resampled at fractional offsets): **not pixel-identical**, not ranked |

### 3.2 Dead CSS (never runs on this page)

0 references in `nodes/2.DyWL8TcE.js` or any other chunk, never seen by the census (F-143): the paid border/rail
packets (20 `stroke-dashoffset` keyframes, CSS 9482-9965), paid dissolve/morph/transfer, the service card and its
`top`/`width`/`height`/`gap` transitions (9214-9367), the quote steps (8113-8174), agents bubble/reply/card/dissolve
(10147-10256), secure currencies/swap (6617-6760), `start-selling-to-image`, orbit swap, carousel cinema, commission
accent sweep. Don't rank them (anim-transform's "20 moving line packets" are these).

### 3.3 What keeps the page drawing at rest (census, st6-rb2)

Counts per 2 s window (60 Hz headless: 120 frames is "every frame"). ULT = UpdateLayoutTree (style), PP = PrePaint.

| y | idle ULT / PP / Paint | a1: main-thread CSS paused | a2: + SMIL paused | what is left, by elimination |
|---|---|---|---|---|
| 0 | 88 / 88 / 187 | 96 / 96 / 231 (3 accent paths) | 104 / 104 / 328 | script: countdown spring (+ accent cycle class flips) |
| 932 | 121 / 122 / 523 | 85 / 85 / 201 (avatar exit) | 89 / 89 / 268 | script: countdown, carousel ticks |
| 1864 | 75 / 75 / 206 | 80 / 80 / 245 | 85 / 85 / 289 | script (#people), not attributed |
| 2796 | 35 / 35 / 27 | 35 / 35 / 25 | 35 / 35 / 23 | script, light |
| 3728 | 103 / 103 / 147 | 58 / 58 / 45 | 20 / 20 / 15 | script (typing, count-up; varies by loop phase) |
| 4660 | 120 / 120 / 602 | 120 / 120 / 394 (2 sweeps) | 48 / 48 / 44 (2 SVGs) | agents typing |
| 5346 | 120 / 120 / 240 | **3** / 120 / 359 (4 sweeps) | **2 / 5 / 0** (2 SVGs), BeginFrame 9 | nothing: idle |

Baseline (same tool, `census-base.json`) differs mainly at y 2796-3728, where the sweeps ran off-screen before
PMsweepGate, and at the top (accent `width` transition, 53-75 Layouts per 2 s, removed by layout-animations).

Reading (F-132/F-139: per-frame cost is mostly the full page's, so what counts is whether a region needs a main
frame at all): **the only CSS-property work left at rest is in the platform tail**, and there it is exactly the
sweep (style every frame) plus the glint (paint every frame). Everything else at rest is script.

## 4. The countdown (T-024 #8): can a compositor practice beat countdown-faces?

countdown-faces (main 24b7db4): 3 faces per digit instead of 10 (80 → 24 face layers), no state writes while the
clock can't be seen, 0 px difference over 295 frozen frames. Open point: on WebKit the digit layers repaint 1-8 %
more often at the top (C 127/129, V 137/130 per 4 s) in 2 of 4 sessions, and C's face layers repaint too, cause
unknown.

Checked ideas, each against a reference:

| idea | finding | status |
|---|---|---|
| WebKit repaints a face layer that rolls back into the cell | yes: a composited layer outside its clip loses its backing store and repaints on re-entry (`GraphicsLayerCA.cpp` l.3034-3058 → `PlatformCALayerCocoa.mm` l.728-739). It explains repaint-on-entry and the equal face memory (0.4 MB for 80 and 24 faces). By count (1-2 faces enter per tick) it does **not** explain all 127-137 repaints per 4 s | mechanism CONFIRMED; share of the count UNRESOLVED (decisive check: Simulator LayerTree paintCount per face per roll) |
| 3-slot faces change text once per roll | a text change in a composited layer repaints it; that is the measured +1-8 % | OBSERVED (countdown-faces X1), consistent with source |
| **transform-only roll on a pre-rendered strip** (one layer per digit, "0123456789" + a second "0", translated by `-(v mod 10)·h`) | same screen position for every face as `KE` gives: face `k` sits at `(k − v)·h` modulo 10 cells, the 11th cell covers the 9→0 wrap; the cell height `h` is the spacer's integer `offsetHeight`, so at DPR 3 every cell starts on a whole device pixel and each glyph rasterizes at the same subpixel phase as in its own face layer; the fractional translate is the same as the face's | identical **by construction** (geometry); raster identity to be shown by countdown-faces' frozen-frame harness. The strip always intersects the clip, so WebKit never detaches it, and its content never changes: **0 text repaints, 0 entry repaints** |
| WAAPI/CSS animation of the roll (compositor in both engines) | `transform` with keyword `linear` between sampled keyframes is accelerated in both (no `steps()`, no `linear()` with points: KeyframeEffect.cpp l.1926-1968); the 1 Hz tick then costs one main frame instead of ~30. But the original's path depends on which frames it gets (60 vs 120 Hz differ by 3.3 px, countdown-faces chain.mjs), while an animation is a fixed function of time: it can match a 60 Hz path within ≈0.08 px with 240 Hz samples (spring ω = √(280/0.3) ≈ 30.6 rad/s, error ≤ a·Δt²/8), never "what the original computes for this frame sequence" | CONFIRMED engine side; **not pixel-identical** by countdown-faces' own standard: user decision |
| `steps()` instead of per-frame JS | would remove the roll (a visual change), and `steps()` runs on the main thread on iOS 26.x anyway | REFUTED as an identical option |
| `contain` / `content-visibility` on the clock | narrows style/layout scope of each write; does not remove the per-frame main frame, which is the cost that matters at rest (F-132); `content-visibility: auto` is already on the off-screen ancestor (countdown-faces census) | OBSERVED reasoning; low value |
| avoid text repaints inside composited layers | the strip does it: no text change ever, no detach | see strip |

Answer: yes, two steps beyond countdown-faces. **G2 (strip)** is identical by construction and removes WebKit's
digit repaints (both the slot text repaints and the entry repaints), with fewer layers (8 per clock instead of 24),
but it keeps the per-frame script. **G4 (compositor roll)** removes the per-frame script too, but only within the
original's own frame-to-frame variation, so it needs the user's call. de-countdown got a heads-up (no edit to its
overlay).

Update from de-countdown after X1 stage 2 closed (0ab7f40):
- countdown-faces (a)'s 3 slots showed no measurable cost on the phone (row 1 not separated). No G2/G4 variant was
  in the arms.
- Agreed with fix-cd-strip: the strip replaces (a) and keeps the hidden skip (b).
- F-146 (OBSERVED, cause unknown): at pastHero, the hidden-skip build shows a bigger once-a-second Layout burst
  (42-61 ms in a single frame vs 30-39 ms), even though it does 38 % less total work. The G2 owner should count
  Layout records per tick at pastHero with and without (b).

## 5. Ranking

Criterion (lead, after C-026): first what the finger feels on st6-rb2 (section 0: the top ~1000 px and the morph
pin), then main-thread frames at rest (F-132: a needed main frame costs the full page), then identity, then risk.

| rank | brief | removes | where it matters | identical | engine risk |
|---|---|---|---|---|---|
| F1 | G2 cd-strip | WebKit digit repaints (hero clock 127-137 per 4 s; the panel clock's per-frame repaint during the morph) and 16 of 24 face layers | top window + morph pin | by construction | memory up on WebKit (whole strip backed); panel needs layered strips (cdwc coupling) |
| F2 | S1 hero-exit-threaded | per-frame JS + hero-subtree restyle for y 0-855 | top window | as a function of scroll position (phone parity measured) | the unexplained +11 ms at the y≈700 flip: Timeline split first |
| F3 | G4 cd-roll-ca | ~30 rAF callbacks per second per clock while it rolls | top window + morph pin | no (frame-sequence dependent) | low; the user decides |
| I1 | G1 glint-ca | per-frame SMIL paint in the secure visual | platform tail at rest | by construction | WebKit mask + animated child: UNRESOLVED |
| I2 | G3 sweep-exact | per-frame style + paint of 1-4 sweep titles in view | platform tail at rest | to ±1 LSB (rounding) | WebKit `plus-lighter`/`multiply` on CA layers: UNRESOLVED |

G1 + G3 together are the only pair that makes a whole region idle (y 5346: PP 120 → 5 per 2 s in the ablation), but
the finger runs show almost no long frames left there on st6-rb2 (1 of 60 moving frames at y ≥ 5000), so they are
battery/heat items, not lag items.

## 6. Fix briefs (TOPICS format, self-contained)

Base for all: st6-rb2 (`fixes/st6-rb2/patch.diff`; JS `7bf7c4657d21`, CSS `f523598b2a24`), stacked with
`fix.mjs new <topic>` + `--on st6-rb2`. Measurement: counts and call tree only (`research/gpu-props/tools/comp-census.mjs
--ablate` for frame counts; `fix.mjs check` for errors/404s; a frozen-frame pixel harness per brief). No timing A/B.
Order by rank: G2 (F1), S1 (F2), G4 (F3), G1 (I1), G3 (I2); the text below keeps the order they were written in.

### G1. glint-ca: secure-network dash glint as a compositor animation

- **Where:** JS `NM` from 12166: SMIL template `DM` 12151-12154 (two `<animate>` on `x1`/`x2`, `begin="indefinite"`,
  `repeatCount="indefinite"`), values 12168-12172 (`keyTimes 0;0.2;0.4;0.6;0.8;1`, `dur 5s` set at 12250-12254; x1
  left `-200;200;200;200;-200;-200`, right `-200;-200;200;-200;-200;-200`; x2 left `-80;320;320;320;-80;-80`, right
  `-80;-80;320;-80;-80;-80`, i.e. x2 = x1 + 120 in every keyframe), start `beginElement()` 12205 (1 s after the
  visual reaches ≥ 35 % visibility, IntersectionObserver 12216), mount gate `s(v) && e(h)` 12260, highlight
  `is-active` 12274; SVG template `OM` 12155-12157 (94x3.2 line, round caps, stroke 3.2, `userSpaceOnUse` gradient
  with 6 stops); CSS 6781-6815 (`.secure-network-dash`, `-svg`, `-highlight`, `.is-active` opacity 0.2 s).
- **Why it lags:** SMIL is main-thread in both engines (Blink requests a main frame every frame while visible,
  `smil_time_container.cc` l.372-392/461-466; WebKit ticks a 1/60 s Timer, `SMILTimeContainer.cpp` l.42/196-216,
  CONFIRMED). Census st6-rb2 y 5346, sweeps paused: PrePaint 120 and Paint 359 per 2 s from the glint alone;
  pausing it leaves PP 5, Paint 0 (OBSERVED, F-141).
- **Rewrite (identical by construction):** viewBox = CSS size, so 1 user unit = 1 px, and x2 = x1 + 120 means the
  gradient only translates. Replace the highlight's moving gradient with:
  - a static wrapper over the dash (same box, same stacking as the highlight `<line>`), masked by the dash shape:
    `mask-image: url("data:image/svg+xml,…")` holding the **same** `<line x1=1.6 y1=1.6 x2=92.4 y2=1.6
    stroke-width=3.2 stroke-linecap=round stroke=#fff>` in a 94x3.2 viewBox, `mask-size: 94px 3.2px`, no repeat
    (the mask's coverage then comes from the same path rasterizer as the stroke);
  - inside it, a 120x3.2 SVG (or element) with the same 6-stop gradient from 0 to 120, `position: absolute; left: 0`,
    animated `transform: translateX(x1 px)` by CSS keyframes at 0/20/40/60/80/100 % with the SMIL values,
    `animation-timing-function: linear` (keyword; SMIL `calcMode` default is linear), 5 s, infinite;
  - the animation runs only while the highlight is `.is-active` (the same `v` that mounts the `<animate>`s today), so
    it starts on the same frame `beginElement()` did and stops when `v` drops; keep the 0.2 s opacity fade;
  - drop the `<animate>` mount (`DM`, `h`), keep the IntersectionObserver and the reduced-motion check (`is-active`
    is never set under reduce, so no extra media rule is needed).
  - Colour: all 6 stops pair equal colours at the transparent ends (`#84b5ff` 0→1, `#ffcca5` 1→0), so SVG's
    non-premultiplied and CSS's premultiplied interpolation give the same colours. Use an SVG gradient anyway.
  - Expected difference: only resampling of a piecewise-linear gradient at fractional device offsets, exact except
    within one device pixel of a stop.
- **Expected (falsifiable):**
  - Chrome census `--ablate` on st6-rb2+G1 at the stop where the secure visual is ≥ 35 % visible, a1 window (sweeps
    paused): PrePaint ≤ 10 and Paint ≤ 10 per 2 s (from 120 / 359), BeginFrame-only frames otherwise.
  - idle window: UpdateLayoutTree unchanged (the sweeps still need it); Paint per 2 s lower than st6-rb2's.
  - `getAnimations()` lists 2 CSSAnimations on the glint, and Blink's `Animation` trace event shows no
    `compositeFailed`.
  - Frozen-frame pixels (pause SMIL with `setCurrentTime(t)`/`pauseAnimations()` on A, `currentTime = t` on B, at
    t = 0.25…4.75 s in 0.25 s steps, both dashes, DPR 3): 0 px differing, or ≤ 1 per channel on ≤ 0.5 % of the dash
    pixels. A larger diff falsifies "identical".
  - WebKit (Simulator, counts): no Paint records for the dash while the glint runs, 1 CA animation per dash.
- **Risks / couplings:** WebKit mask layer + accelerated child transform: that the mask is not repainted per frame is
  UNRESOLVED (decisive check: Simulator Timeline paint records at the secure visual). The dash's own entry
  (`secure-network-dash-in`, scaleX) animates the parent: keep the wrapper inside `.secure-network-dash` so it scales
  with it. scene-scope's paused-scene rules don't touch this element (st6-rb2 removed the 40 platform pause
  selectors, RBi40pti); the observer already stops it off-screen. No overlap with countdown-faces or st6.

### G3. sweep-exact: the four sweep titles as a compositor animation, exact

- **Where:** baseline CSS: the rules holding `animation: … start-selling-platform-i-doc-sweep` at 5707 (title-doc,
  28 px, rule from 5687), 5769, 5846, 5907, 5954, 11103; keyframes 5802 (`background-position` 100 % → 0 %, 4 s
  linear infinite); gradient `#fff 0 33.33%, #82bcff 40%, #2483ff 45%, #ff66f4 50%, #ff3029 55%, #fe7b02 60%,
  #fff 66.67% 100%`, `background-size: 300% 100%`, `background-clip: text`, `display: inline`; PMsweepGate
  (st6-rb2 JS ~3970-3990) sets `data-sweep-paused` off-screen.
- **Why it lags:** `background-position` is main-thread style + paint every frame in both engines (CONFIRMED,
  matrix 8224). Census y 5346: pausing the 4 sweeps takes ULT from 120 to 3 per 2 s (OBSERVED, F-141).
- **Rewrite (identical up to 8-bit rounding):** original pixel = bg·(1−c) + band(x)·c, where bg is whatever opaque
  backdrop is behind the title and c is the glyph coverage. Build exactly that sum:
  - layer A (static): the word in `#000`, normal compositing over the existing backdrop = bg·(1−c) (works for any
    opaque backdrop, no colour assumption);
  - layer B (an isolated group composited onto A with `mix-blend-mode: plus-lighter`): a `#000` box, the same word
    in `#fff` (= c), and the gradient band as a `::after` 300 % wide with `mix-blend-mode: multiply`, animated
    `translateX(-66.6667%) → translateX(0)` 4 s linear infinite (that is the image offset `background-position`
    100 % → 0 % gives at `background-size: 300 %`, as in illusion-sweep) = band·c;
  - A + B = bg·(1−c) + band·c: no colour changes, unlike illusion-sweep's `darken` (which shifts `#fe7b02` to
    `#fe7b22` and gives `min(edge, band)` at glyph edges).
  - B's word is `aria-hidden`; the readable word stays in A. Pause the band with `[data-sweep-paused]` like today.
  - Keep the site's reduced-motion rule (put the new block under `prefers-reduced-motion: no-preference`).
- **Expected (falsifiable):**
  - Chrome census `--ablate` on st6-rb2+G3, y 5346: idle window UpdateLayoutTree ≤ 10 per 2 s (from 120); with G1
    too, PrePaint ≤ 10 (the a2 figure: 5).
  - Frozen-frame pixels, both arms paused at the same `currentTime` (0, 0.5 … 3.5 s): max channel difference ≤ 1
    over the title boxes. Any pixel off by ≥ 2 falsifies "exact".
  - Layers: +2 per title in view (A's box is not a layer; B and the band are).
- **Risks / couplings:**
  - **Check line count first:** the sum is exact only for titles on one line. With `display: inline` and
    `box-decoration-break: slice`, a wrapped title's background runs as one strip across the lines; a per-line band
    would not match. Measure the four titles' `getClientRects().length` at 430 px.
  - WebKit: `plus-lighter` and `multiply` on CA layers with a transform-animated child: UNRESOLVED whether it stays on
    the compositor (Simulator paint-record check).
  - Conflicts with illusion-sweep (same titles): the user picks one; G3 is the exact one.
  - layout-animations' PMsweepGate and st6-rb2's line 3982 must keep working on the new element.

### G2. cd-strip: one pre-rendered strip per countdown digit

- **Where:** JS `$E` from 3823 (10 `.face` spans, transform at 3862: `translateY(${KE(r, s(a)) * s(c)}px)`, `c` =
  spacer `offsetHeight`), `KE` from 3804, `GE` from 3791 (spring, unchanged); CSS ~1397-1416 (`.digit` overflow
  hidden, `.face` 1408: `will-change: transform`, `inset: 0`); cdwc rule (st6-rb2 CSS 11932-11937, panel faces
  `will-change: auto`). st6-rb2 does **not** include countdown-faces (no `__cdSlots` in its JS): stack on
  st6-rb2 + countdown-faces if that lands first and replace its 3-slot faces with the strip, keeping its hidden
  skip (b) as is; otherwise on st6-rb2 alone.
- **Why it lags:** WebKit repaints the hero's face layers 127-137 times per 4 s at the top (countdown-faces X1,
  OBSERVED). Part of that is CONFIRMED by source: a face that leaves the clip loses its backing store and repaints
  when it rolls back in (F-142); countdown-faces' slot text changes add 1-8 %. In the morph, the post-mortem
  (`research/design-engineering/postmortem-morph.md` §0.3, §1b, build g Timeline) named the panel clock's digit
  repaints as the Composite term of the slow morph frames; st6-rb2's cdwc made those faces unlayered, so each spring
  frame now repaints the digit area inside the panel layer. C-026: the morph pin holds 91 of st6-rb2's long frames
  (median frame 20 ms there).
- **Rewrite (identical by construction):** per digit, one `span.strip` (`will-change: transform`, absolute, top 0)
  with 11 cells `0 1 … 9 0`, each cell a block of the face's box (`height` = the face's box height, glyph centred the
  same way), cell `k` at `top: k·c px`; transform `translateY(${-(((v % 10) + 10) % 10) * c}px)`. Face `k` lands at
  `(k − v)·c` mod `10·c`, which is `KE(k, v)·c` for the two faces in the cell; the 11th cell is the wrap. `c` is an
  integer (offsetHeight), so at DPR 3 the glyph's subpixel phase in the strip equals its phase in its own face layer.
  Panel clock: two arms. (a) strips layered (`will-change: transform`, 8 small layers with static content: no
  repaint at all while rolling); (b) cdwc's rule retargeted to `.strip` (unlayered, as now: the roll still repaints
  the digit area in the panel layer). The morph gain needs (a); cdwc removed the panel's face layers when there were
  80 of them, so ask cdwc's owner (st6-rb2 / scene-scope) before shipping (a).
- **Expected (falsifiable):**
  - Chrome LayerTree: hero face layers 80 (or 24 with countdown-faces) → 8 strip layers.
  - WebKit Simulator (countdown-faces' `x1.mjs`/`sim-counts.mjs`, `--lt`): face/strip layer repaints at the top ≤ 8
    per 4 s (first paint only) against 127-137; digit-sized Paints ≤ 4.
  - countdown-faces' frozen-frame harness (`probe.mjs pixels`, 295 shots, 60 and 120 Hz, resume cases): 0 px.
  - Morph (phone or Simulator Timeline with the morph driver `__fwMorphDrive`, counts only): Paint records inside
    the panel's clock rect per spring frame → 0 with arm (a); layer count in the panel +8.
  - Per-frame script unchanged (one transform write per rolling digit instead of 3-10): main frames at rest equal
    within noise. This brief is about WebKit paint, not frame count.
- **Risks / couplings:** WebKit backs the whole strip (it always intersects the clip): about 1200x51 device px x 4 B
  ≈ 0.25 MB per digit, ≈ 2 MB per clock, against 0.4 MB of face backing today (OBSERVED X1); Chrome rasterizes only
  visible tiles. Find-in-page and copied text see `0123456789 0` per digit, as the original sees `0123456789`; faces
  stay `aria-hidden`. Owner: de-countdown / countdown-faces (heads-up sent, their overlay untouched).

### S1. hero-exit-threaded: the hero exit as a threaded scroll-driven animation, on st6-rb2

- **Slug:** `hero-exit-threaded` (restack of topic 7 `hero-exit-scroll-timeline` v2, variant 09, onto st6-rb2).
- **Where:** st6-rb2 JS hero block, writer `s` 4391-4400 (`getBoundingClientRect` of the hero track, then
  `--exit-opacity` on `.hero` every scroll frame; baseline ~4383-4400); CSS: the `@supports (animation-timeline:
  view())` block of the v2 patch (`.claude/worktrees/agent-a77e2ec753b6381fb/fixes/hero-exit-scroll-timeline/
  variants/` 09, the `--v2` build; P3 = 10 and v3 = 11 are its siblings). Nav callback `_` (st6-rb2 13270-13280)
  keeps its own rect read and the 0.72 flip; it is not part of this brief.
- **Rewrite:** v2 unchanged in substance: 7 `ViewTimeline` animations (4 phone deck cards, `.hero-copy`, 2 on
  `.scroll-float`) on `opacity`, `transform`, `translate`, `filter` only; blur as its own animation from
  `blur(0px)`, never from `none`; no animated custom property in any keyframe (FINDINGS P3, `StyleInterpolation.cpp`
  l.254-264); attached only after `is-splash-done` (JS path until then). Take v3's `forwards` blur fill (variant 11)
  so the cue keeps `blur(18px)` past the range end like the original.
- **Identity:** the exit is a function of scroll position in the original, so a scroll timeline with the same
  mapping is identical at every position, whatever the frame sequence (unlike G4). Measured by fix-hero-exit:
  Chrome values equal to 3 decimals at 9 progress points on both viewports; iPhone 26.6.1 copy opacity
  .901/.501/.03, cue blur 1.78 vs 1.79 px at 0.1, deck card .825 at 0.5 on both. Differences: the cue's
  `filter: none` at rest instead of `blur(0px)` (no visual change), off-viewport layouts not animated.
  Re-check that parity on the st6-rb2 base (writer `s` at 4393/4399, 6 `--exit-opacity` uses in its CSS; the
  morph's `--morph-fade` at 13287 is a separate writer and stays).
- **Why it helps the finger feel:** today every scroll frame in y 0-855 runs JS, reads layout and restyles the
  hero subtree before WebKit can paint; the C-026 band y < 1000 holds 63 of st6-rb2's 81 long moving frames.
  With threaded scroll-driven animations (CONFIRMED for Safari 26.4+, section 0.3) WebKit updates those 7
  animations on the scrolling thread. Measured earlier on the phone (scripted, n = 3, aw1-10e base): the y≈50
  frame 48 → 35 ms.
- **Risk, to clear first:** the same runs show the y≈700 frame (the 0.72 flip: nav leaves the pill, #people
  reveal) about 11 ms longer with v2, on WebKit only (Chrome counts equal). Cause LOCATED, not named. Before a gain
  block, run the ST-1 split (postmortem-hero Card 1): v2 vs v2-endearly (variant 20: every range ends at `contain
  70%`, before the flip) vs control, Timeline on, counting Layout / Composite records in the flip frame. If
  v2-endearly removes the +11 ms, ship the end-early ranges only if they stay identical (they don't as written:
  9.2 % at 35 % progress) or split the exit so nothing is mid-range at the flip.
- **Expected counts:**
  - Chrome (census probe, mobile 430x932, scroll y 0 → 900 in 20 px steps): `--exit-opacity` writes 0 (from one per
    step); hero-subtree `UpdateLayoutTree` element count per step down to the 7 animated elements or fewer;
    forced layouts from `s` 0.
  - WebKit (Simulator or phone Timeline, counts only): `getAnimations()` 7 `ViewTimeline` animations; no Style
    Recalculation records attributed to the hero during y 0-855 except at attach; flip-frame Layout / Composite
    counts equal to control (the ST-1 question).
- **Couplings:** nav `_` reads the same track rect (keep it); re-keep-op (the #people card's resting
  `opacity: .999`) and h1 touch the same flip frame; st6-rb2 (scene-scope) is the base: restack on whatever it
  is when the brief starts, and keep `.hero`'s `pointerEvents` (`none` below 0.05, set by `s` today) through the
  animation's end state or one IntersectionObserver; FINDINGS T12
  (scroll timeline technique), P3 (no custom properties), P12. Owner of the original topic: fix-hero-exit.

### G4. cd-roll-ca: the countdown roll as a compositor animation (user decision)

- **Where:** as G2 (needs the strip, or 10 faces), plus `$E`'s spring effect 3828-3841 (rAF loop calling `GE`).
- **Idea:** at each target change, compute the spring path with `GE` on a 240 Hz grid until `done`, and start one
  `strip.animate()` with those `translateY` samples as keyframes (`easing: 'linear'` keyword, `fill: 'forwards'`);
  cancel and restart from the current value when the target changes mid-roll. No per-frame script, no state writes;
  the 1 Hz tick costs one main frame.
- **Expected:** Chrome census y 0, a1 window: UpdateLayoutTree per 2 s from ~96 to ≤ 10 (plus the accent cycle);
  WebKit: 0 countdown rAF callbacks at rest, one CA animation per rolling digit.
- **Why it is a decision, not a fix:** countdown-faces' identity standard is "for any frame sequence, show what the
  original computes for that sequence". A time-based animation is a fixed function of time: it matches the 60 Hz
  path within ≈ 0.08 px but cannot follow the original's frame-dependent path (60 vs 120 Hz differ by 3.3 px in the
  original itself). Under the strict rule it is not pixel-identical; the user decides whether "within the original's
  own run-to-run variation" is acceptable.

### Not recommended (with reasons)

- Toolbar resize (section 0.2): no identical compositor-only form while fixed/sticky boxes and `dvh` must follow
  the toolbar; small on this page in the C-026 data.
- Avatar exit `clip-path: ellipse()` (section 0.3 row 5): no transform/opacity equivalent.
- Blur entries (cred/profile/invoice): no blur-free identical form; Chrome-only main-thread cost; WebKit
  composites them (F-140).
- nav "earn" unmask: load-time only, 0.98 s once; a counter-translated wrapper keeps the content exact but resamples
  the mask.
- Hero `--copy-in`/`--entered`: load-time only; owned by hero-exit.
- Layout transitions (`gap`, `grid-template-rows`, nav `width`): FLIP is geometry-identical, not raster-identical
  during the motion.
- Boil/caret `step-end` loops (WebKit main thread): owned by illusion-boil-ca.
- Dead CSS (section 3.2): never runs.

## 7. Files

- `research/gpu-props/README.md`: this file.
- `research/gpu-props/tools/comp-census.mjs`: the census/matrix/ablation probe (counts only; reads `tools/lib/cdp.mjs`).
  Outputs stay in `out/gpu-props/` (gitignored): `census-base.json`, `census-st6rb2.json`, `matrix.json`.

Findings posted: F-140 (blur not composited in Chrome), F-141 (what keeps the page drawing at rest), F-142 (WebKit
backing-store detach), F-143 (dead platform CSS), F-145 (toolbar resize mechanism; threaded scroll-driven animations).
