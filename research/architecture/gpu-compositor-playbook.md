# GPU (compositor-only) playbook: what the end-of-page morph taught us

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). This doc
> names class names and line numbers of the frozen baseline (`site-pretty/`, pinned by `baseline.json`); keep it on
> local branches, never push.

Owner: arch-gpu-playbook (architecture), 2026-10-06, user thread T-204 #53; the "Next elements to try" list puts the
section the user named in T-224 first (lead, 15:57Z). Docs only: nothing here was measured, no Chrome, Simulator or phone
run.

Sources: `fixes/compositor-morph/README.md` (CM v1 to v1.2, P-157), `fixes/hit-skip/README.md`, findings F-309, F-312 to
F-315, F-140, F-162, F-227, `fixes/FINDINGS.md`, `fixes/morph-gpu/README.md` (PR-012, the earlier reveal),
`fixes/end-morph-p1/README.md`, `fixes/v10/README.md`, `research/gpu-lessons/README.md` (countdown, T-096),
`research/gpu-props/README.md` (property reference), `research/architecture/claims-audit.md`, `fixes/end-bg/README.md`,
`fixes/people-avatars/README.md`, `fixes/people-word/README.md`, `fixes/blur-cubic-v8/README.md`, `fixes/st6-rb/README.md`.

Conventions:
- JS = `/_app/immutable/nodes/2.DyWL8TcE.js`, CSS = `/_app/immutable/assets/2.gBuqKVzi.css`, 1-based lines of the
  prettified baseline unless a build (v9-final, v10) is named.
- Status words per CLAUDE.md "Platform claims": OBSERVED (our data only, in our setup), CONFIRMED (a cited reference
  agrees), REFUTED, UNRESOLVED. Every engine claim below carries one.
- "m" is the morph value (0 closed, 1 open). "CM" is compositor-morph (PR-030), "C" its control (v9-final).

## In plain words

- **The trick:** stop writing styles from script on every frame. Give the browser a finished animation of
  `transform`, `opacity` or `filter`, tied to the scroll position (a scroll timeline) or to time (a CSS or Web
  animation). The engine then plays it without asking the page's main thread to lay out or repaint.
- **What CM got for it (counts, no timing):** Simulator, opening the card: paints 559 → 145, layouts 181 → 125. Phone
  (P-157, robot finger): Paint per morph frame cut to about 0.28x, Layout to less than half. The user accepted it as
  PR-030.
- **What it does not remove:** WebKit still restyles every element whose scroll-driven animation is active, on every
  frame (CONFIRMED in source, OBSERVED on the phone). And any script that reads layout in the same frame still forces
  a layout: the phone kept about 1 Layout per morph frame (C 2.3), and the Simulator's call stacks put most of the
  layouts forced inside script on two such reads.
- **The order that worked:** read the engine source first, then Chrome counts, Simulator counts, pixel gates with A/A
  floors, a registered phone block, then trace what is left by call stack, then the user's Try-it.
- **Next:** the People section (title first), the `#platform` fade at the end, and the scroll reads left in the morph
  tick (section 6). The one-screen checklist is section 7.

## 1. What the technique is

Per-frame work on WebKit's main thread has three parts: style (recompute values), layout (positions and sizes) and
paint (record what to draw). The compositor (Chrome's cc thread, WebKit's UI-process scrolling thread or Core
Animation) can move, fade and filter layers that are already painted without any of the three.

So the technique is:
1. **Only compositor properties move:** `transform` (and `translate`, `scale`, `rotate`), `opacity`, `filter`,
   `backdrop-filter`. Never `width`, `height`, `top`, `margin`, `padding`, `gap`, `grid-template-*`, `border-radius`,
   colours, `clip-path`, `stroke-dashoffset`, `background-position`, or a custom property (`--x`) inside keyframes.
2. **The driver is declarative:** scroll-linked motion goes on a scroll timeline (`animation-timeline: scroll()` or a
   named `view-timeline`); time-based motion is a CSS transition, CSS animation or `element.animate()` with keyword or
   `cubic-bezier()` easing.
3. **Layers exist before the motion starts:** wrappers and helper layers are created at load (CM's `__cmDom()` runs in
   the morph-scroll setup), so the first moving frame only flips a class.
4. **No script writes per frame.** Script may still flip classes or state at thresholds (CM: 9 buckets of m), and may
   read nothing that forces layout in the moving frames.
5. **Shapes that are not transforms are rebuilt from transforms.** CM's changing rounded box is the full-size nav cut
   by four nested `overflow: hidden` corner clippers (radius 32 px), each scaled by k = r/32 and counter-scaled inside,
   so the content stays put (`fixes/compositor-morph/README.md` "Step 2").

Engine facts this rests on:

| claim | status | reference |
|---|---|---|
| Safari on iOS 26.4+ runs qualifying scroll-driven animations threaded, by default | CONFIRMED (source) | WebKit `safari-7624.5.1.11-branch` `UnifiedWebPreferences.yaml` 8316-8329, `PlatformEnableCocoa.h` 934-936; webkit.org/blog/17862 |
| the threaded path accepts transform, opacity, filter, backdrop-filter, needs a scroller with a scrolling node, and refuses size-dependent transforms and reference filters | CONFIRMED (source) | `KeyframeEffect.cpp` 1930-1958, 3142-3153; `ScrollTimeline.cpp` 416-426; `AcceleratedEffect.cpp` 141-145 |
| every rendering update ticks every active scroll-driven animation and invalidates its target's style, threaded or not | CONFIRMED (source); OBSERVED on the phone (P-157 row A: style in 0.855 of moved frames with the animation, 0.277 without) | `AnimationTimelinesController.cpp` 140-180, `WebAnimation.cpp` 1554-1576, `KeyframeEffect.cpp` 2081-2088, 125-133 |
| custom properties are never accelerated in WebKit | CONFIRMED (source) | `StyleInterpolation.cpp` 254-264 (research/gpu-props §0.3) |
| time-based animations with `steps()` or `linear()` with points stay on WebKit's main thread on 26.x | CONFIRMED (source) | `KeyframeEffect.cpp` canBeAccelerated (claims-audit P5, F-048/F-065); the threaded scroll-driven path returns before those checks (gpu-props §0.3) |
| Chrome does not composite blur-filter animations (the whole effect falls back) | CONFIRMED (source) | Blink `compositor_animations.cc`, flag 4096 (F-140) |
| Chrome: a scroll-driven animation in range costs one style recalc per main frame, 0 Layout, 0 Paint | OBSERVED (Chrome 154 probe) | `fixes/compositor-morph/README.md` step 1 |

## 2. When it pays off, and how to spot a candidate fast

It pays when a visible thing moves for many frames in a row and each frame today costs Layout or Paint on the main
thread. The gain is "no layout, no repaint, no per-frame script", not "no main-thread work": the style pass stays
(section 1).

**Signals in traces we already have:**

| signal | where to read it | what it means |
|---|---|---|
| Layout > 0 and Paint ≥ 3 in most moving frames | Chrome `cm-chrome.mjs` / `em-chrome.mjs` per-frame medians; Simulator Timeline Layout / Paint per RenderingFrame (`cm-sim.mjs`); phone Timeline per moved frame (`cm-read.mjs`, P-155 calibration: Layout 2.3, Paint 11.6-12.2 per morph frame on C) | a style-driven geometry or paint animation: candidate |
| raster tasks per frame ≫ paints | Chrome census | big layers re-rastered each frame (CM: 15 → 3 per open frame) |
| `compositeFailed` bits 8192 / 8224 / 4096 on an `Animation` trace event | Chrome trace (`research/gpu-props/tools/comp-census.mjs`) | 8192 / 8224: an unsupported property (custom properties included); 4096: a blur. The animation runs on the main thread |
| Layout inside script (a stack under rAF or a scroll callback) | Simulator Timeline with `maxCallStackDepth` (the `lay-sim.mjs` pattern, CM "Where V's remaining Layout comes from") | forced layout: fix the read first; the compositor cannot remove it |
| style recalc every frame with nothing visibly moving | Simulator Timeline at rest | an invisible per-frame write (custom property, class) or a scroll-driven animation in range |

**Signals in code** (`node tools/fix.mjs grep`):
- `style.setProperty('--…')` or inline style writes inside a `dE(...)` callback, a rAF loop or `__msTick`;
- `getBoundingClientRect`, `offsetHeight`, `scrollHeight`, `elementsFromPoint`, and on WebKit `window.scrollY` (it lays
  out whenever the page is scrolled and layout is dirty: CONFIRMED, `LocalDOMWindow.cpp` 1477-1481, F-313, claims-audit
  W7) inside the same callbacks;
- CSS transitions or keyframes on the "never" list in section 1, `steps(` or `linear(` easings, `@keyframes` that use
  `var(--…)`;
- CSS whose value is `calc(... var(--x) ...)` for a size, radius, colour or blur that changes per frame.

**Quick design questions:**
1. Is the value a pure function of the scroll position? Then a scroll timeline. Of time after a trigger? Then a
   transition or `animate()`.
2. Is it linear in the driver? Then two keyframes. If not, a keyframe grid at the kinks (CM: about 90 points on each corner
   counter-scale, 17 on the columns).
3. Does it need geometry? Read it once into a hidden size box watched by a `ResizeObserver`, never in a moving frame.
4. Is the result pixel-identical? If not, it is a proposal with Try-it (memory illusion-must-be-pixel-identical).

**When it does not pay:**
- the cost is forced reads in script (a less-work fix: hit-skip, V13);
- the work is WebKit's own response to the viewport (toolbar resize, research/gpu-props §0.2);
- the motion is a discrete step (no frames in between to save);
- the motion is a single short event at load;
- the cost is Chrome-only (a blur entry, F-140);
- a large blur handed to the compositor can composite more slowly than before: blur-cubic doubled the Composite of
  the frame after the #people reveal (Simulator 111 vs 55 ms, phone 74 vs 42 ms; OBSERVED, `fixes/blur-cubic-v8/`,
  `fixes/st6-rb/`). Count Composite, not only Paint.

## 3. The recipe CM followed, gates in order

Order of events: CM v1 (design, Chrome and Simulator counts), then v1.1 (two after-close fixes, phone card, commit
c5a4b0f2), P-157 signed (2829a853) and run, then the call-stack trace of what Layout was left, then v1.2 (hit test
skipped past m 0.2, end fix, screencast pixel gate; c7c19ae4), hit-skip as its own delta into v10 (e6411f27), then the
user's Try-it decision (accepted, PR-030).

0. **Ask the engine first.** Before building, CM answered "does a threaded scroll-driven transform/opacity animation
   still cost main-thread work per frame?" from WebKit's source (section 5) and one small probe page per engine. The
   answer (style yes, layout and paint no) set the predictions.
1. **Design around one function.** `__cmVals(m, geometry)` returns every part's transform, opacity and filter at m.
   It feeds three things: the generated `@keyframes fw-cm-<key>` on the view timeline `--fwms`, the inline values for
   the first frame (a new scroll-driven animation is pending for one frame, F-162), and the threshold buckets that
   flip Svelte state where today's template does (`__cmK`). The range is `cover 0% cover 100lvh` on a `100lvh`
   element, so it matches the morph's range at any toolbar state. Geometry comes from a hidden size box and a
   `ResizeObserver`. Gated by `CSS.supports(...)` and the phone media query; everything else keeps today's path.
2. **Chrome counts gate** (`fixes/compositor-morph/gates/cm-chrome.mjs`: 430x775 DPR 3, touch, one scroll step per
   rAF, 40 steps per direction, per-frame medians and a layer census). Pass: Layout per moving frame → 0, rasters
   down, style up by about one pass. CM: open 2/1/7/15 → 3/0/3/3 (style/layout/paint/raster).
3. **Simulator counts gate** (`gates/cm-sim.mjs`, iOS Simulator Safari Timeline, rAF-stepped, counts only, F-084:
   Simulator ms are never a gain). CM v1.2 open: paints 559 → 145, layouts 181 → 125, styles 91 → 68.
4. **Rest and after-close probe.** Count paints per layer in 500 ms windows after the motion ends. It caught two
   behaviour bugs in v1 (transitions animating the jump back, a one-shot animation replaying). Fixed in v1.1.
5. **Pixel gate with A/A floors** (`gates/cm-px2.mjs`, PR-010 multi-pair A, V, A2, V2; "consistent" = over 8 levels in
   all four cross pairs while neither A/A pair is). Use `--capture screencast` (section 4, pitfall 3). Score every stop
   on the way up and down, not only jumps: the m 1 cell differed by path (1.99 % through the scroll, 0.19 % by a jump,
   Chrome). Repeat in the Simulator. Not identical means a proposal.
6. **Layers and memory** at m 0, 0.5, 1 and at rest after: CM adds 14 layers (6 drawing) and about 21-45 MB
   (estimated) in Chrome while the morph stands, Simulator 44 → 56 layers, none before the zone or after the close.
7. **Phone block** (P-157, protocol v2): one question, arms C and V from an immutable snapshot with served-hash checks,
   G driver (WDA robot finger), xcode-serious profile, C V V C order, uncounted warm-ups, an end sentinel, kit pinned
   by sha256, a dry run, and predictions frozen before data. Predictions were per stage: P1 Layout ≤ 0.3 per frame,
   P2 Paint ≤ 0.5x C, P3 style stays (share ≥ 0.8), plus an attribution probe page (no animation / scroll-driven /
   rAF writes). Result: Paint 0.28-0.29x HIT, style HIT, row A HIT, **Layout 1.00-1.04 per frame MISS** (C 2.23-2.38).
   No frame-time separation (post hoc, decides nothing).
8. **Trace what is left by call stack** (Simulator Timeline with stacks, WDA strokes; phone records carry no stacks).
   Of the 291 layouts forced inside script in V's session (922 frames), 158 came from `elementsFromPoint` in the nav
   hit test and 44 from `window.scrollY` in `__msTick`. v1.2 skips the hit test while its answer cannot show (m > 0.2), and the same
   skip on today's build became hit-skip (Simulator layouts 656 → 621 and 610 → 573). V13 (no scrollY or geometry
   reads in `__msTick`) shows the next 64 forced layouts (section 6, candidate 3).
9. **Proposal with Try-it.** CM was not pixel-identical (small edge and text differences mid-morph), so it went to the
   user with A and B pages and known issues listed (Chrome screenshot-only corners, Chrome text softness at m 1).

## 4. Pitfalls and their fixes

| # | pitfall | what we saw | fix |
|---|---|---|---|
| 1 | Expecting zero main-thread work | the per-frame style pass stays (CONFIRMED source; phone row A OBSERVED) | predict per stage: style stays, paint down, layout = what script forces. Keep the animated set small (CM: ~40 elements) |
| 2 | Forced layout left in script | P-157 Layout MISS: 1.00-1.04 per frame vs the 0.3 bound; stacks: hit test and `scrollY` | trace stacks before the phone block; skip reads whose answer cannot show (hit-skip); pass the engine's y and cache geometry by `ResizeObserver` (V13). A skipped read moves the layout to the next reader (F-313): remove all of them in that callback |
| 3 | Chrome screenshot-only artifacts | `Page.captureScreenshot` showed 1282 alpha-0 px at the card's bottom corners in V only, flipping between repaints; the screencast frame of the same state was clean (F-315, OBSERVED, one headless run). Code lead: captureScreenshot is a forced redraw plus surface copy, and viz clears outside backdrop bounds (UNRESOLVED, inference) | pixel gates use `--capture screencast`; screencast frames come out at 1x (OBSERVED), so score them against a screencast A/A floor; confirm in the Simulator (clean, 0.068 %) |
| 4 | RGBA vs RGB shots (F-314) | the scorer compared an RGBA shot with RGB ones byte by byte: 0.05 % read as 60-88 % | fixed in pxlib (f5826c5b, 353ee6aa: every shot decoded to RGBA); still check PNG colour type (byte 25 = 6) when a score jumps |
| 5 | Chrome keeps the raster scale during transform animations | text rastered at m 0.95 stays at m 1: 1.99 % vs 0.19 % by a jump; Safari 0.108 % (OBSERVED; code lead `cc/layers/picture_layer_impl.cc` 1120-1123, 1257-1269 at chromium main 39d5b374; UNRESOLVED as the cause) | score the scroll path, not only jumps; possible remedy: let the layer re-raster once m rests (drop the animation or its layer hint at rest). Chrome/Android only |
| 6 | The end value is never reached | state writes by bucket stopped at the last bucket (qM 0.92), so x stayed 0.9496 at the resting end; still frame ~2 % off | add a bucket for each resting end (`t >= 1`, and 0). Any threshold scheme needs its rest states as buckets |
| 7 | First frame blank | a new scroll-driven animation draws nothing in its first frame (F-162, OBSERVED) | write the inline values for that frame, then let the animation take over |
| 8 | Leaving the mode replays motion | the nav's `:not(.is-morphing)` width/background transitions animated the jump back; replacing the animation list restarted the Join unmask | hold transitions off for the flip frame (`html.fw-cm-out`, two rAFs); keep existing animations in the new list by the same name. A rest probe after the motion catches both |
| 9 | Range shrinks with the toolbar | `entry 0% .. 100%` ended early when the toolbar made the viewport shorter than 100lvh (Simulator, OBSERVED) | `cover 0% cover 100lvh` on a 100lvh element |
| 10 | Simulator jobs deferred during phone blocks | while a phone block is marked, Simulator sessions print DEFERRED (I-160) | run Simulator gates before the block or in split sessions (v10 used 120 s sessions, `px-split.sh`); put the phone card together while you wait |
| 11 | Layer memory and promotion cost | CM +14 layers and ~21-45 MB (Chrome estimate) while open; morph-gpu's reveal +3 layers / +3.9 MiB and a +7 ms first open frame; P1 +11 ms first open (P-156) | create wrappers at load so the first frame only flips a class; census layers at rest (nothing left behind) and mid-motion; name the cost in the card |
| 12 | A big blur on the compositor | blur-cubic made the #people card's blur CA-eligible and doubled the next frame's Composite (section 2) | for full-screen blurs, count Composite; prefer opacity/transform, or a pre-blurred layer cross-fade (a proposal) |
| 13 | Clips | WebKit animates `clip-path` on the main thread; a changing radius has no transform form; Chrome clips a backdrop-filter inside nested rounded clips by the outermost clip only (F-309, CONFIRMED by source reading) | nested corner clippers scaled by r/32 with counter-scaled children (CM). F-309 was REFUTED as the cause of CM's corners (pitfall 3) |
| 14 | Chrome counts hide WebKit cost | Chrome counts equal while the phone shows CAUSE (end-bg P-137); 6x CPU slows only the main thread (claims-audit C5) | Chrome is a second view; the Simulator is the main count; the phone decides |
| 15 | Opacity or filter "presence flips" | opacity crossing 1 or a filter to or from `none` is a Layout difference in WebKit (CONFIRMED, claims-audit W1) | keep endpoints off the flip (`.9999`, `blur(0px)`), as rev 3 and P1 do |

## 5. Read source first: which files answered what

Memory `read-source-first.md`: if open code can answer it, read the code (via `gh`, read-only), then probe to confirm.

WebKit (`safari-7624.5.1.11-branch` unless noted; the phone's iOS 26.x is in the 7624 family, claims-audit §2):

| question | file and lines | answer, status |
|---|---|---|
| Are scroll-driven animations threaded on iOS 26.x? | `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` 8316-8329; `Source/WTF/wtf/PlatformEnableCocoa.h` 934-936 | yes, stable, default on: CONFIRMED |
| What qualifies? | `Source/WebCore/animation/KeyframeEffect.cpp` 1930-1958, 3142-3153; `ScrollTimeline.cpp` 416-426; `platform/animation/AcceleratedEffect.cpp` 141-145 | transform, opacity, filter, backdrop-filter; scrolling node needed: CONFIRMED |
| Does style still run every frame? | `AnimationTimelinesController.cpp` 140-180; `WebAnimation.cpp` 1554-1576; `KeyframeEffect.cpp` 2081-2088, 1706-1710, 125-133 | yes, each tick invalidates the target's style: CONFIRMED (phone row A agrees) |
| Without the threaded path? | `KeyframeEffect.cpp` 1960-1961 | never accelerated, main thread every frame: CONFIRMED |
| Why does `scrollY` force layout? | `Source/WebCore/page/LocalDOMWindow.cpp` 1477-1481 | non-zero scrollY calls `updateLayoutIgnorePendingStylesheets`: CONFIRMED (F-313) |
| Custom properties in keyframes? | `StyleInterpolation.cpp` 254-264 (safari-7624-branch 0f8c6795, gpu-props) | never accelerated: CONFIRMED |
| Opacity or filter flips? | `StyleDifference.cpp` miscDataChangeRequiresLayout, tag 7624.4.5 l.192-209 (claims-audit W1) | Layout difference: CONFIRMED |
| Does a changed clip-path repaint? | WebKit main as read 2026-10-03: `RenderElement.cpp` ClipPath → RecompositeLayer; `RenderLayerBacking::updateMaskingLayer` carries "FIXME: Avoid repaints when clip path changes" | UNRESOLVED (morph-gpu card) |
| Time-based CA animations' frame rate | safari-7624-branch 0f8c6795: `PlatformCAAnimationRemote.mm` 609-613; `CAFrameRateRangeUtilities.h` 36-42 | 80-120 Hz asked: CONFIRMED in source; on our phone UNRESOLVED (gpu-lessons C9) |

Chromium (main, read via `gh`; commit named where the source note pinned one):

| question | file and lines | answer, status |
|---|---|---|
| Why square glass corners in nested rounded clips? | `third_party/blink/renderer/platform/graphics/compositing/property_tree_manager.cc` CloseCcEffect, SynthesizeCcEffectsForClipsIfNeeded | backdrop clipped by the outermost synthesized clip only: CONFIRMED by source reading (F-309) |
| Why soft text at m 1? | `cc/layers/picture_layer_impl.cc` 1120-1123, 1257-1269 (39d5b374) | raster scale and translation kept while a transform animates: code lead, cause UNRESOLVED |
| Why corners erased only in screenshots? | `content/browser/devtools/protocol/page_handler.cc` ~1420/1630; `render_widget_host_impl.cc` 2371-2400; `components/viz/service/display/skia_renderer.cc` 964-1010 (clear 975-981, rrect 870-881) | captureScreenshot is a forced redraw plus copy; the clear outside backdrop bounds fits but is UNRESOLVED (inference) |
| Which animations does Chrome composite? | `third_party/blink/renderer/core/animation/compositor_animations.cc` at ebb14bcc (F-140); `cc/trees/layer_tree_host_impl.cc` AnimateInternal (gpu-lessons C1) | transform/opacity yes, blur no (4096), custom properties and unsupported properties no: CONFIRMED |

## 6. Next elements to try (ranked by expected benefit, user rule T-204 #39)

Candidate 1 is first because the user named it (T-224); 2-4 are ranked by benefit. Nothing was measured for this
list: the evidence is existing notes and code reading. Every row names the decisive first checks for its fix owner.

### 1. The People section: "People still need people", title first (user-named, T-224)

**Where.**
- Markup: `section#people` (JS 11257), title `h2#future-heading` with a lead line ("People still need", JS 634) and a
  words span that holds the "people" word whose "o" is the avatar stack `.start-selling-future-people-o` (component
  template from JS 6157, classes `is-stack` / `is-expanded` at JS 6446-6448).
- Title CSS: CSS 2436-2454; phones CSS 3533-3555 (the title becomes a centred flex column, the lead on its own line;
  `:has(.is-stack)` adds a 4 px gap, 3553-3555).
- The "o": CSS 2465-2593.
- Card: `.start-selling-future-card` (CSS 2374-2418, phones 3519-3525: `min-height: 100svh`).
- Community pill avatar carousel: `.start-selling-avatars.is-carousel`, CSS 2872-2912.

**What runs, and its main-thread cost.**

| part | driver | what moves | cost and evidence |
|---|---|---|---|
| the title's "o" widens | IntersectionObserver (threshold 0.35) on the heading → `is-stack` after 1300 ms, `is-expanded` 120 ms later; reset on leave, so it replays on every re-entry (JS 6225-6275) | `grid-template-columns` 0.6042em → 5.25em and `height` over 0.92 s; each face `max-width`, `width`, `margin` 0.4 s and `border-width` 0.2 s, staggered 0.17 s; the vector "o" opacity, transform, `filter: blur(0.6px)` | layout every frame for about 1 s, and the centred line re-centres "p…ople" each frame. Chrome 6x: 57 layouts in the 1.5 s grow vs 3 with the transitions off; on close while scrolling 50-53 vs 30-34; compositeFailed 8224 (unsupported property) (fixes/people-avatars, OBSERVED) |
| the busy main thread around it | page animations outside #people | hero accent `stroke-dashoffset`, idle-frame opacity, he-bob, vinyl, countdown cells | Simulator at the title: 56-73 whole-view Layouts per 2 s, 5 with the whole page paused (F-227, OBSERVED on v7). The "o" itself adds no WebKit counts there, but it is main-thread-only, so it stutters when that thread is busy, which here is every frame |
| the card reveal | future callback `l` sets `is-visible` at hero-track progress ≥ 0.72 (JS 11303-11311, template 11469) | baseline: opacity 0.7 s, `filter: blur(14px)` → none 1.6 s, translateY(48px) 0.9 s on a card at least one screen tall (CSS 2393-2414); v9-final: blur 0.9 s with a `linear()` easing | `linear()` with points keeps the transition on WebKit's main thread (CONFIRMED, section 1); the phone's frame after the reveal was 42 ms on RB (S driver, n 3), and the build with the CA-eligible variant (stack5, blur-cubic) made it 74 ms (OBSERVED, fixes/st6-rb, fixes/blur-cubic-v8) |
| scroll callback | `l` every scroll frame in range (JS 11303-11325) | rect reads of `.hero-track`, the card and `v` (`is-pain-dark`); `--future-shrink` writes (no visible effect on phones, CSS 3384-3388) | forced reads per frame (less work; phone-invisible-shrink gated some of them in earlier builds; check what v10 still runs) |
| pill carousel | timers 800 / 220 ms (JS 11345-11358) | avatar swap; st6's exit uses `clip-path` | WebKit animates clip-path on the main thread, 0.22 s per swap (research/gpu-props §0.3 #5) |

Older phone data puts many long frames here: on st6-rb2 under a finger, 63 of the 81 long moving frames sat at
y < 1000 (hero exit, #people entry, nav pill drop; n 1, OBSERVED, research/gpu-props §0.1); iphone-wave2 saw 50-51 ms at
y ≈ 687-704 (#people entry). v10 itself has no #people data yet.

**A compositor version.**
- **The "o" widening as FLIP, no layout per frame** (FINDINGS T5, "FLIP without reads"): set the final grid width at
  once; animate "p" by `translateX(+Δ/2)` and "ople" by `translateX(-Δ/2)` back to `none`, Δ from the em values the
  CSS already has (5.25em − 0.6042em), never from a rect read. Each face slides from its stacked place by `translateX`
  (index × the spacing change) instead of `max-width`/`width`/`margin`. Keep its opacity and scale as they are. The
  border stays fixed or cross-fades by opacity. The "o"'s own clip while collapsed becomes a counter-translated clip
  wrapper (the CM corner-clipper idea, straight edges only).
- **The card reveal without a main-thread blur:** opacity + translateY only, or a pre-blurred copy cross-faded by
  opacity. Both change the look, so both are proposal options. The route that keeps the look, a `cubic-bezier()` split
  of the curve (blur-cubic), is CA-eligible but cost more Composite on this full-screen card, so it is out unless the
  blurred area gets smaller.
- **Optional, scroll-linked:** the reveal is time-based after a threshold. A `view()` timeline version would follow the
  finger instead of playing on its own (a motion change: proposal, like morph-scroll).
- **Not touched:** the lead line; reduced motion (CSS 3615-3630 already switches the transitions off).
- Identity: start and end frames can match exactly. In-between frames move text by transform, not by layout, so they
  differ by sub-pixel resampling: a proposal with Try-it (memory illusion-must-be-pixel-identical).

**Risk.** Medium. The "o" is a centred inline flex inside a balanced title, so the FLIP needs both directions (open
and the close on leave) and RTL checked (T5's `direction` note). People-word option a (PR-024, accepted, not in v10's
list) changes when the "o" starts; build on whichever base the lead picks. The F-227 background layout may still
dominate on WebKit, so the title gain may need the hero's off-screen animations paused too.

**Size.** M (CSS + one effect in the "o" component; the card option is CSS only).

**Decisive first checks for the fix owner** (counts only, no timing):
1. Chrome counts on v10 (+ CM): rerun `fixes/people-avatars/trace-chrome.mjs` with arms V, N ("o" transitions off) and
   NB (card blur off): Layout, UpdateLayoutTree elements, Paint and raster per frame in the grow, close and reveal
   windows, plus compositeFailed reasons.
2. Simulator counts on v10 (`sim-o.mjs`, `sim-why.mjs`): the same windows, with and without the hero's animations
   paused, to split the "o" from F-227's background layout; Layout roots (title box vs view).
3. Simulator frame after `+is-visible` (the `frame2.py` method of stack5 / blur-cubic-v8): Composite and Layout on v10.
4. Which hero animations still run while the title is on screen (scene gate `rootMargin: 100%`, TOPICS row 12):
   `getAnimations()` at the title on v10.
5. Then a FLIP prototype ("o" only) through the section 3 gates (checklist, section 7). The phone comes after: the
   title shows for only 0.1-0.3 s in flicks, so the phone run needs a slow-scroll G script that parks at the heading.

### 2. The `#platform` fade at the end of the page, onto the morph's scroll timeline

- **Element.** `section#platform` (`.start-selling-platform`), the section under the end-of-page card.
- **Evidence.** The nav's `S()` writes `--morph-fade = 1 − min(1, m / 0.55)` inline on `#platform` (baseline JS
  13012-13018, `QM` 12699, `KM` 12683). The CSS turns it into `filter: blur((1 − f) × 12px)` and opacity (CSS
  5388-5393; v9-final caps opacity at 0.9999 and registers `--morph-fade` non-inheriting). CM still calls `S()` on every
  tick (`__cmSet`, `fixes/compositor-morph/delta.diff` line 250), so this is the morph's last per-frame style write. In
  the Simulator, after P1 the remaining painters were `#platform` (32 paints per open, 38 per close, a 430x1880 layer,
  "its blur fade") and the morph centre (`fixes/end-morph-p1/README.md`, OBSERVED).
- **Compositor version.** `@keyframes fw-pf { 0% { opacity: .9999; filter: blur(0px) } 55% { opacity: 0;
  filter: blur(12px) } }` on `#platform` with `animation-timeline: --fwms; animation-range: cover 0% cover 100lvh`.
  It is linear in m, so it is exact with 2 keyframes. `pointer-events` (< 0.05) and pause (c) stay as threshold
  buckets in `__cmSet`. Then CM's per-frame script writes nothing.
- **Risk.** The threaded path accepts filter (CONFIRMED). But a 12 px blur on a large layer run by the compositor may
  composite more slowly (blur-cubic, section 2). Chrome falls back to the main thread for blur (F-140): no Chrome gain,
  so the Simulator decides. The opacity guard must stay under 1 (pitfall 15).
- **Size.** S (one generated keyframe block plus the buckets, inside CM's code).
- **First checks.** Simulator `cm-sim.mjs` open/close: paints of `#platform` per frame and Composite per frame, CM vs
  CM + fade; pixels at the CM stops.

### 3. The scroll reads left in `__msTick` (V13, less work rather than GPU)

- **Evidence.** After v1.2 the largest stack left is `__msTick` (`window.scrollY`, 119 calls with work, 64 forced
  Layouts); V13 passes the engine's y and caches geometry (cleared by the existing `ResizeObserver`). Simulator, one
  session per arm: V12 547 layouts / 314 inside script, V13 483 / 181 (`fixes/compositor-morph/README.md`, OBSERVED;
  the scrollY mechanism CONFIRMED, F-313).
- **Change.** As V13 (`out/cm/V13` in the CM worktree): the y the scroll event already read, plus cached `offsetHeight`
  and `scrollHeight`.
- **Risk.** Low. The values must refresh on resize and on content growth above (the morph-scroll `ResizeObserver`
  already watches `main`). No visual change, so it lands under the less-work rule.
- **Size.** S. **First checks:** two Simulator pairs (HS-style decision rule: total layouts down in both), Chrome
  counts at parity, pixels T0.

### 4. The end-screen title sweeps: are they really off the main thread?

- **Evidence.** On the end screen at m 1, the "secure" and "organized" title spans repaint about 20 times per 700 ms
  window in Chrome, in every arm, also with their gradient removed: the sweep animation keeps invalidating
  (`fixes/end-bg/README.md` §7, OBSERVED). P-137 (phone, G) cut slow frames 16 → 3 when pictures and three title
  gradients were removed together (CAUSE); P-144 could not split pictures from titles (Simulator control failed).
  platform-idle's G3 moved the sweep to a masked `::after`; whether it composites on WebKit was left UNRESOLVED.
- **Compositor version.** The gradient band as its own layer moved by `transform` under a static text mask, so the
  mask never changes and nothing repaints. G3 meant to do this; the check is whether it does.
- **Risk.** Low. The titles are small, and the cost per paint here may be small too (P-137 cannot tell).
- **Size.** S. **First checks:** Chrome `Animation` compositeFailed on the sweep and paint counts per title; the
  Simulator paint count of the title layers at m 1 over 4 s, sweep on vs paused.

**Not ranked:**
- the hero accent draw: `stroke-dashoffset` has no exact compositor form, and the user turned down the wipe (PR-001);
  the boil is done (PR-019);
- the nav earn button's collapse (layout properties, owned by nav-earn);
- the fee bar `width` (mid-page, small; `scaleX` with a radius check);
- the toolbar resize (WebKit's own work, research/gpu-props §0.2).

## 7. Checklist (one screen; for the memory index)

Memory `breakthroughs-become-practices.md`: this checklist is the practice's index entry. Every owner of a
scroll-linked or always-running animation checks its area against it and reports "applies" (with its first check) or
"does not apply" (one line why). Three rules carry the most weight: predict per stage (style stays); trace Layout by
call stack before the phone block; score the scroll path with screencast captures and A/A floors.

```
GPU / compositor-only fix: checklist
[ ] Candidate: moving frames show Layout or Paint (Chrome cm/em-chrome, Simulator Timeline, phone reader)
[ ] Not a forced-read problem? (Simulator stacks: Layout inside script -> fix the reads first)
[ ] Source read for every engine claim the design needs (gh, read-only; cite path + line + branch)
[ ] Driver: scroll position -> scroll/view timeline; time -> transition / animate() with keyword or cubic-bezier
[ ] Only transform / translate / scale / rotate / opacity / filter / backdrop-filter in the keyframes; no var(--x)
[ ] One value function; keyframe grid at kinks; geometry from a ResizeObserver size box, never in a moving frame
[ ] Wrappers and layers created at load; first frame covered by inline values (F-162)
[ ] Script per frame: no style writes, no layout reads; state flips by buckets, with buckets for both resting ends
[ ] Leaving the mode: transitions held off for the flip frame; existing animations kept by name
[ ] Range survives the toolbar (cover 0% cover 100lvh); reduced motion and desktop keep today's path
[ ] a11y: wrappers role=none, decoration aria-hidden; inert / aria / tabindex flip where they did
[ ] Gate 1 Chrome counts: layout/frame ~0, raster down; style +1 pass is expected
[ ] Gate 2 Simulator counts: paints and layouts down (counts only, no ms)
[ ] Gate 3 rest probe after the motion: no extra repaints, no replayed animations
[ ] Gate 4 pixels: PR-010 multi-pair, --capture screencast, A/A floor per path, stops up AND down, Simulator too;
    check PNG colour type; not identical -> proposal with Try-it
[ ] Gate 5 layers/memory at m 0 / 0.5 / 1 / rest; first-frame promotion cost named
[ ] Gate 6 phone block: one question, predictions per stage frozen before data, kit pinned, dry run, sentinel,
    attribution probe; Simulator gates done before the block (I-160)
[ ] After the block: trace what is left by stack; next delta is often a less-work fix
```
