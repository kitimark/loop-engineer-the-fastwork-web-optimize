# What made the countdown smoother, and where else it applies (T-096)

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). This
> README quotes class names and line numbers of the frozen baseline (`site-pretty/`, snapshot pinned by
> `baseline.json`); keep it on local branches, never push.

Owner: arch-gpu-lessons (architecture), 2026-10-04. User thread T-096 (#4), after PR-017 (cd-roll-ca, accepted rev 4,
option land; landed on main, logged in 2c80e6af). Method: counts and code reading only. There was no timing A/B, no phone
time and no new Chrome run (memory/defer-timing-focus-call-tree.md). The counts come from fix-cd-roll-ca's saved traces.
- Line numbers are 1-based in the prettified baseline: JS `/_app/immutable/nodes/2.DyWL8TcE.js`, CSS
  `/_app/immutable/assets/2.gBuqKVzi.css`. The exception is where a Chromium or WebKit source file is named.
- Status words follow CLAUDE.md "Platform claims":
  - OBSERVED: our data only;
  - CONFIRMED: a cited reference agrees;
  - REFUTED;
  - UNRESOLVED.
- Verifier: ver-gpu-lessons, read-only. Its plan and the fetched sources are in the session scratchpad, not
  committed. Sources:
  - Chromium `chromium/chromium` main at about M157, read 2026-10-04. Every mechanism cited predates the M154 branch point.
  - WebKit `safari-7624-branch` `0f8c6795ea` (iOS 26.x).

## In plain words

- **What changed.** The old countdown moved each rolling digit from script, once per screen frame, for about half of
  every second. The new one hands each roll to the browser as one finished animation of `transform` only. The
  graphics side then plays it frame by frame with no script and no page work. Both engines do this, and their
  sources say so (CONFIRMED, §1.2).
- **Why it can feel much smoother while the total work barely changed.** Two effects add up:
  - Off the main thread. The roll no longer waits for the page's main work. When the page is busy (a scroll, a
    layout), the old roll could only move when the page finished a frame; the new one keeps moving. CONFIRMED in
    both engines. But on the Mac at rest our traces show the old roll never actually waited (0 held frames, §1.3).
    So at rest this effect has nothing to fix; it matters while the page is busy.
  - A higher frame rate on the iPhone. Safari asks for page updates at about 60 per second. But for every
    animation it hands to the graphics side, WebKit asks for **80-120 frames per second** (CONFIRMED in WebKit's
    source since January 2024, §1.2 C9). So on an iPhone with a 120 Hz screen the new roll can be drawn about
    twice as often as the old one. Whether the phone really does this is UNRESOLVED: Apple's docs say heat or
    Low Power Mode turn the high rate off. This one fits "much smoother" best, if the user felt it on the iPhone.
- **The cost.** On the iPhone, each roll's start and end costs the page one extra layer update (CONFIRMED in
  source, C7). That fits the 1-2 extra frames over 50 ms per run in P-093.
- **Where else the same trick applies** (§2, 22 items mapped). Most of the page already uses it. Already done:
  the hero exit (threaded scroll-driven, landed as v6), the platform glint and sweeps (platform-idle), the
  countdown (cd-strip, cd-roll-ca). What is left, ranked (§3):
  1. **The hero accent word** (the hand-drawn word in the headline) and its "boil" flicker. These are the last
     main-thread animations in the hero, where most remaining finger lag sits. On the iPhone the drawing forces a
     small page re-layout on every frame for 1.8 s of every 3 s. Both already have look-alike drafts from 10-02
     (illusion-accent-wipe, illusion-boil-ca) that never reached a decision. The proposal (§4.3) is to bring them
     to the user with Try-it pages.
  2. **The panel clock roll** (P-097, already registered by fix-cd-roll-ca). It is the same change as PR-017, for
     the second clock. Ready, small.
  3. **The end-of-page morph** (the nav growing into the panel). It is the biggest remaining moving surface, and it
     runs where the finger still feels lag (the end pin). Today it is a 680 ms script tween. The proposal (§4.1)
     is to play it as finished animations, like the countdown. It is on hold, for two reasons:
     - Safari can't hand the panel's rounded clip to the graphics side. A changing corner radius has no exact
       replacement.
     - Its owner reports that the per-frame cost left after the morph-gpu changes is already small (Simulator
       counts). So the gain may be mostly the iPhone frame rate, which is unconfirmed.
     It waits for the current phone block (P-098) and the frame-rate check (§4.4).
- **One new question for the heat goal.** Every always-running graphics-side animation (marquees, vinyl spin,
  scroll cue) also asks for 80-120 Hz. That may keep the iPhone's screen at a high rate while they are visible,
  and it may be the unexplained 80 Hz stretches in finger runs (F-071). UNRESOLVED. One phone frame-rate record (§4.4) would settle this, the "why" above and whether the morph item is worth it.
- **Follow-up T-102: how Svelte, React and Vue do it, and the leanest exact roll** is in
  [frameworks.md](frameworks.md).
  - Frameworks hand the browser either 2 keyframes and a curve, or samples, or script every frame. None of them
    reproduces a stepped 60 Hz spring.
  - fix-cd-roll-ca's K (one curve piece per piece of the original) is the minimum exact form: 52-66 keyframes per
    cell per roll instead of 144-343.
  - `linear()` runs on the main thread in shipping Safari.
  - WebKit main's new threaded path would tick these animations at 60 Hz.

## 1. Mechanism: what PR-017 changed

### 1.1 Before and after, per roll

| | before (C8: st6-rb2 + cd-strip) | after (V9: + cd-roll-ca) |
|---|---|---|
| driver | `$E` effect (JS 3828-3841): one rAF loop per rolling digit, `GE` spring (3791-3803, semi-implicit Euler, 16 ms substeps) | one `__crPlay` per roll: `__crPath` samples the same spring at 60 Hz once, then one `Element.animate()` per moving strip cell, keyword `linear` between the samples, `fill: both`, shared `startTime`; one rAF for the start frame |
| property | inline `transform: translateY(…)` written per frame (Svelte template effect, 3862) | `transform` keyframes, handed to the compositor |
| main thread per displayed roll frame | rAF callback, Svelte update, style recalc of the written cells, then paint/commit | nothing |
| main thread per roll | ~23-26 rAF callbacks (fix-cd-roll-ca: countdown script calls per roll 23-26 → 1) | one start (animation creation, style, compositing update) and one end (C7) |
| who draws each frame | renderer main thread → commit → compositor | Chrome: cc impl thread (C1). WebKit: Core Animation in the render server (C4) |
| frame rate it is drawn at on the iPhone | page rendering updates, ~60 Hz (CONFIRMED pref, claims-audit §2.7) | CA asks for 80-120 Hz (C9) |

Totals (fix-cd-roll-ca README, OBSERVED): full page, Chrome, 6 s at y 0:
- main frames: 295/298/306 (before) vs 250/262/257 (after);
- compositor frames: 360 for both;
- Paint and Layout: equal.

Frozen page (only the countdown moving): main frames 205 → 79. Simulator, full page: RenderingFrame 223/206 vs
210/203 per 4 s. That is the puzzle the user saw: most of the page's other work stays, so the totals barely move.

### 1.2 Platform claims (verifier cards, condensed)

| # | claim | status | reference (line numbers as of the cited branch) |
|---|---|---|---|
| C1 | Chrome: a composited transform/opacity animation (CSS, transition or WAAPI) is ticked on the compositor (impl) thread each frame, with no BeginMainFrame | CONFIRMED (long-standing, in M154) | `cc/trees/layer_tree_host_impl.cc` `AnimateInternal` l.835-861 (`DCHECK(IsImplThread())`, `SetNeedsRedraw(animation_only)`), `AnimateLayers` l.5051-5085 (only `SetNeedsOneBeginImplFrame`); `docs/how_cc_works.md` l.24, 224, 290; chromium.org "Compositor Thread Architecture" ("executed on the impl thread … hitch free"); developer.chrome.com "Inside look at modern web browser (part 3)" |
| C2 | Chrome: when the main thread is busy, a composited animation keeps the display rate; a rAF animation gets fewer callbacks | CONFIRMED for the mechanism; "holds, then jumps" WEAKENED (no reference says it; for a time-based spring it follows from the code: `GE(t, e, o - n)` integrates the whole gap) | `how_cc_works.md` l.326-330 (draw without waiting for a commit); web.dev/articles/smoothness "Main and compositor thread updates" |
| C3 | Chrome trace `PipelineReporter` fields: PRESENTED_PARTIAL = compositor update shown, main-thread update for that vsync missed; `has_main_animation` = any rAF callback, inline-style mutation or non-composited Blink/SMIL animation was active that frame, page-wide | CONFIRMED for the meanings. Counting "frames where *the roll* missed" from them is WEAKENED: the flags are not per element | `cc/metrics/compositor_frame_reporter.cc` l.1633-1663; `frame_info.h` l.22-41; perfetto `chrome_frame_reporter.proto` l.32-43, 91-94; `frame_sequence_metrics.h` l.63-80; `client_layer_tree_host_impl.cc` l.247-260; `animation_host.cc` l.1105-1118 |
| C4 | WebKit iOS: an accelerated animation is built as a real CAAnimation in the UI process and run by Core Animation (render server); the web process does not tick it while it runs | CONFIRMED (safari-7624-branch) | `KeyframeEffect.cpp` `canBeAccelerated` l.1926-1971 (no `steps()`, no `linear()` with points, replace only), `ticksContinuouslyWhileActive` l.2672-2677 (false while completely accelerated and running); `AnimationEffect.cpp` l.393-395 (next tick at the end); `GraphicsLayerCA.cpp` l.1169-1218; `RemoteLayerTreePropertyApplier.mm` l.511 → `PlatformCAAnimationRemote.mm` `createAnimation` l.496-625; Apple "Core Animation Basics" (render tree), "Understanding hitches in your app" (render server is a separate process). The UI-process "threaded time-based animations" path stays off (`UnifiedWebPreferences.yaml` l.8339-8352) |
| C5 | WebKit: each visible change made by a rAF style write needs a web-process rendering update and a layer-tree commit; if it is late, the last committed tree stays on screen | CONFIRMED (the "stays on screen" part is the design's consequence and Apple's hitch doc wording) | HTML "update the rendering" (rAF runs inside it); `RemoteLayerTreeDrawingArea.mm` `updateRendering` l.319-345, CommitLayerTree l.411; Apple "Understanding hitches" ("the previous frame remain[s] onscreen") |
| C6 | Scrolling runs off the page's main thread in both engines; JS scroll-handler effects render behind the scroll | CONFIRMED | MDN/firefox-source-docs "Scroll-linked effects"; WebKit `RemoteScrollingTree.cpp` l.72-86 (UI process, then ScrollUpdate to the web process); Chromium `main_thread_scrolling_reason.h` l.31-36, 63-67 |
| C7 | WebKit: starting an accelerated animation on an element that is not composited yet forces a compositing update (backing created, painted) on the main thread; with `fill: both` the effect is not "currently affecting" after its end, so the layer is demoted again | CONFIRMED by source for the start; the end-of-roll demotion is the verifier's inference from source; "the whole layer tree is rebuilt" is WEAKENED (overstated) | `KeyframeEffect.cpp` l.2015-2017, 2345-2353, 1685, 2426-2429; `RenderLayerCompositor.cpp` `requiresCompositingForAnimation` l.3813-3830, `layerStyleChanged` l.2190-2196; `GraphicsLayerCA.cpp` l.1214-1215 |
| C9 | WebKit asks Core Animation for 80-120 Hz on **every** CA animation it creates, regardless of the 60 Hz page-update preference | (a) CONFIRMED in source; (b) Apple: on iPhone, >60 Hz needs an opt-in, and heat or Low Power Mode turn it off, CONFIRMED (docs); (c) whether Safari on the iPhone actually gets >60 Hz for them: UNRESOLVED | `Source/WebKit/WebProcess/WebPage/RemoteLayerTree/PlatformCAAnimationRemote.mm` l.609-613 (`setPreferredFrameRateRange:highFrameRateRange()`, `setHighFrameRateReason:webAnimationHighFrameRateReason`, under `HAVE(CORE_ANIMATION_FRAME_RATE_RANGE)`); `Source/WebKit/Platform/cocoa/CAFrameRateRangeUtilities.h` l.36-42 (`CAFrameRateRangeMake(80, 120, 120)`); landed 273122@main (69f1d44719, 2024-01-17, "[iOS] run animations performed by Core Animation at a higher frame rate"); page updates stay at 60: `RemoteLayerTreeDrawingAreaProxyIOS.mm` l.43, 167-176, 326-336, pref default true `UnifiedWebPreferences.yaml` l.6392-6407; Apple "Optimizing iPhone and iPad apps to support ProMotion displays". Safari's Info.plist has no `CADisableMinimumFrameDurationOnPhone` key (iOS 26.5 Simulator); WebKit uses the private high-frame-rate reason instead, which 278949@main's message suggests is what unlocks it on iPhone (verifier's inference) |

I re-read the decisive lines of C9 and C4 myself: `PlatformCAAnimationRemote.mm` l.609-613 and `KeyframeEffect.cpp`
l.2672-2677 say what the table says.

### 1.3 What our own traces show (OBSERVED, Chrome 154 headless 60 Hz, full page at y 0, 6 s, 3 runs per arm)

Source: fix-cd-roll-ca's saved traces (`out/cd-roll-ca/full/trace-{C8,V9}-r{1,2,3}.json` in its worktree), read
by two scratch scripts (`pr.mjs`: PipelineReporter per frame, reused async ids paired in time order; `held.mjs`:
countdown rAF updates inside rolls). No new measurement.

| per run, 360 presented frames, all PRESENTED_ALL | C8 (spring) | V9 (compositor roll) |
|---|---|---|
| has_main_animation (page-wide, C3) | 355-360 | 220-240 |
| presented with no main-thread commit in the frame | 55 / 63 / 65 | 98 / 103 / 110 |
| compositor animation only, no main animation, no commit | 0 / 3 / 4 | 80 / 92 / 105 |
| C8: compositor frames inside a roll / frames with a countdown rAF update | 153-161 / 162-170 (every frame updated; the update count includes both clocks) | n/a |
| C8: gaps between countdown updates inside rolls | all ≤ 18 ms (one 19-25 ms in 473) | n/a |

fix-cd-roll-ca's headed probes on the Mac's 120 Hz screen agree (`probe-base-headed.json`): the original's rAF gaps
were < 10 ms in 1758 of 1808 frames, 10-13 ms in 49.

Reading:
- V9 really does move the digits in frames where the main thread does nothing: 80-105 frames per 6 s are
  compositor-only page-wide. That is the mechanism, visible in the trace.
- At rest on the Mac the old roll never waited for the main thread: every frame inside a roll carried its update.
  So **at rest on the Mac, "the main thread made the roll stutter" does not explain the felt difference**.
  What is left, in order of fit:
  1. **The iPhone frame rate (C9).** If the user felt it on the phone, the roll went from ~60 Hz to up to 120 Hz.
     Only a phone frame-rate record can show it (§4.4).
  2. **The roll while the page is busy** (scrolling, layout). Off-main-thread then matters (C2, C5, C6). fix-cd-roll-ca's
     T-096 card counts this (window S, a busy-main check).
  3. **A different path on a 120 Hz screen.** The build plays the 60 Hz path; the original at 120 Hz differs by up to
     29.6 px on 0→9 (fix-cd-roll-ca, "Position identity"). It is a different motion, not just a smoother one.
     Modelled spring (`GE`, no overshoot at any rate):

     | screen rate | roll 0→1: settle, max step per frame | roll 9→0: settle, max step |
     |---|---|---|
     | 60 Hz | 433 ms, 9.0 px | 550 ms, 80.6 px |
     | 80 Hz | 413 ms, 5.8 px | 525 ms, 52.2 px |
     | 120 Hz | 392 ms, 3.6 px | 492 ms, 32.8 px |

- The P-093 phone result (V: 1-2 frames over 50 ms per run, C: 0) fits C7: each roll's start and end is a main-thread
  compositing step on WebKit, plus F-201 (a running cell holds a backing store). Moving work to the graphics side
  is not free on WebKit; the bill comes at the start and the end of each animation.

### 1.4 The lessons, as rules for the rest of the page

1. **Time-based motion belongs in CSS animations, transitions or WAAPI on `transform`/`opacity`**, with keyword or
   `cubic-bezier()` easing. Then no main-thread work per frame in either engine (C1, C4), and the motion survives a
   busy main thread (C2, C5). On the iPhone it may also be drawn at up to 120 Hz instead of 60 (C9). An exact
   script path can be kept by sampling it into keyframes, with `linear` between samples (cd-roll-ca's pattern).
2. **Scroll-linked motion belongs on a scroll timeline** (`animation-timeline: scroll()/view()`). Safari 26.4+ runs it
   on the scrolling thread (CONFIRMED, research/gpu-props §0.3); a JS scroll handler always renders behind the
   scroll (C6).
3. **What WebKit will not hand over:**
   - custom properties (`--x`);
   - time-based `steps()` and `linear(…)` with points;
   - clip-path, mask, width/height, colours (research/gpu-props §2).
   Every animated value has to be a real `transform`/`opacity`. A changing clip becomes a static clip moved by
   counter-translated transforms (the illusion-accent-wipe technique).
4. **Pay the start and end once, not often** (C7, F-201, F-207/F-208): keep the animated element composited
   between runs (an existing layer, or `will-change: transform` where WebKit's iOS policy honours it). Prefer one
   long animation over many short ones. Don't create animations on every frame.
5. **Identity:** a fixed function of time is not the same as the original's frame-dependent script path. Sampled
   keyframes match the original's 60 Hz path; any difference that shows only in motion goes to the user as a
   proposal (memory/illusion-must-be-pixel-identical.md).

## 2. Inventory: every moving thing on the page, by driver

The script side was mapped by a read-only helper (22 rows, JS file read in full). The CSS side is
research/gpu-props §3.1, re-checked against the status board on 2026-10-04 09:2xZ.
- "Phone": what a 430 px touch phone shows.
- "GPU-able": whether a transform/opacity animation could carry it in WebKit.
- Gain: H = in a place where the finger still feels lag (the top ~1000 px, the end pin; research/gpu-props §0.1);
  M = runs at rest only; L = load-only or neutralised.

Engine facts behind every scroll row:
- One rAF per scroll/resize. `rE` (2667) schedules it; `iE` (2670-2673) runs every active callback.
- Five callbacks (commission, hero, profile, future, platform) schedule a second rAF, so they land one frame later.
- `dE` pauses CSS animations in inactive scenes: `data-start-selling-scene`, CSS 11754-11758.

| # | element | JS (CSS) lines | driver | properties | phone | function of | GPU-able | owner / state | gain |
|---|---|---|---|---|---|---|---|---|---|
| 1 | hero exit (`.hero` → `.hero-copy`, cue, deck cards) | 4163-4175 (1530, 1734-1736, 2038-2125) | scroll cb → rAF, rect read, `--exit-opacity` | opacity, blur, translate via custom props | yes | scroll (linear, 100vh) | yes, threaded scroll-driven (Safari 26.4+) | **done**: hero-exit-threaded R2 landed (v6) | — |
| 2 | hero ring splash | 4186-4230 | rAF loop 1.82 s at load | `--ring-motion-blur`, card transforms | no (≤600 px skips) | time | yes | none | L |
| 3 | hero accent word draw | 3670-3787 (1230-1283) | timers → class → CSS animation | `stroke-dashoffset` (WebKit: SVG layout per frame, F-097), `width` transition | yes | time (3.05 s/word, 1.8 s drawing) | as a wipe by a counter-translated static clip (not identical: draw becomes wipe) | illusion-accent-wipe (draft, never decided); layout-animations (width) | **H** (hero window) |
| 4 | accent / underline / zero "boil", carets | CSS 1291-1301, 166-172, 674-688, 461, 9145 | CSS `step-end` | opacity | yes | time | yes with non-stepped timing (illusion-boil-ca; not identical) | illusion-boil-ca (draft, never decided) | H (accent boil at the hero), M rest |
| 5 | countdown, hero clock | 3823-3876, 3918-3981 | 1 Hz interval → rAF spring | `transform` | yes | time | yes | **done**: cd-strip + cd-roll-ca | — |
| 6 | countdown, panel clock | 13160 (+ #5 code) | same, second instance; ticks while the panel is hidden | `transform` | yes | time | yes, gated to m ∈ {0,1} (cdwc coupling) | **P-097** (fix-cd-roll-ca, registered) | H (end pin), less work |
| 7 | commission shrink | 3106-3127 (4-58, 916-921) | scroll cb → rAF lerp 0.22 | scale, radius via custom props; height; classes | **neutralised** (scale 1); background class flips; rect and `Range` reads still run | scroll + lerp | n/a on phone | phone-invisible-shrink (measured) | less work only |
| 8 | commission underline | 3130-3139 | IO + 900 ms timer | class → CSS dash draw, boil | yes | time, once | as #3/#4 | — | L |
| 9 | referral fee visual | 2404-2607 | timers + 2 rAF count-ups | text, `.fee-progress` `width`, `--visual-scale` | yes | time | progress bar as scaleX/counter-clip (radius check) | rest-script (landed: loops gated) | M |
| 10 | pain notes | 4555-4748 | rAF one-shot, 3 s interval (desktop), scroll cb `d` | note geometry (desktop); `d` sets state from a rect read per scroll frame | base notes only; `d` runs per scroll frame | scroll threshold | n/a | — (helper flag: `z(T, [], !0)` with a new array per frame may re-notify; runtime check open) | less work |
| 11 | future shrink + `is-visible` + `is-pain-dark` | 11303-11329 (2311-2417, 3385-3388) | scroll cb → rAF lerp | `--future-shrink`; classes → CSS fade (opacity, blur 14px, transform), background | shrink neutralised; fade and dark flip visible | scroll thresholds → time (transition) | fade: opacity/transform yes, blur no in Chrome (F-140) | phone-invisible-shrink, re-keep-op | L |
| 12 | community pill avatar swap | 11330-11447 (2872-2912) | 800/220 ms timers → template swap + CSS | flex-basis/width/margin + opacity/transform (st6: clip-path) | yes | time | ellipse clip-path: no | st6 landed; pill-swap closed | — |
| 13 | people-O stack/popover | 6160-6454 | timers (classes); scroll cb only after hover | classes; popover position | classes yes, popover no (hover) | time | yes (classes → CSS) | — | L |
| 14 | profile showcase | 10790-10977, 11246 | scroll cb → rAF lerp (desktop); phone: deck scroll → timer → smooth `scrollTo` | `--profile-scale`, shell `translate3d`, section height | desktop only; phone sets idle values per frame | scroll + lerp | desktop: yes | — | L (phone) |
| 15 | platform shrink | 12436-12446 (5528-5550, 10990-11016) | scroll cb → rAF, no lerp | `--platform-shrink` (scale, radius), class → background | neutralised; background class flips | scroll (pure smoothstep) | desktop: yes, scroll-driven | phone-invisible-shrink | L (phone) |
| 16 | count-ups, typing (profile stats, agents ask) | 11961-12150, 11496-11659 | timers + rAF | text | yes | time | no (text) | rest-script, illusion-typing-chunks | M |
| 17 | secure-network glint | 12151-12285 | SMIL | gradient x1/x2 | yes | time | yes | **done**: platform-idle | — |
| 18 | sweep titles | CSS 5707-5954 | CSS `background-position` | background-position | yes | time | yes (G3) | **done**: platform-idle | — |
| 19 | nav theme and hit test | 12950-13011, 13077-13079 (11355-11405) | scroll cb inline: `getBoundingClientRect`, `pointerEvents` write, `elementFromPoint` | classes → CSS transitions (background 0.7 s, opacity, transform; width only > 640 px) | yes (`is-on-dark`, hidden/shown) | scroll → time | hidden/shown: opacity/transform yes; background: no (WebKit) | nav-hit-test (F-204) | M (per-frame reads; not a GPU item) |
| 20 | end-of-page morph | 12688-12699, 13013-13088, 13243 (10545-10584, 11328-11488, 5388-5393) | non-passive wheel/touch listeners → **680 ms easeOutCubic rAF tween** of `--morph` (not a spring) | `--morph` → top, width, height, color-mix background, radius, backdrop blur, gap, max-width, padding, panel blur/opacity/scale; `--morph-fade` → platform blur + opacity | yes | input → time | only through morph-gpu's reveal (transforms + opacity), except its rounded `clip-path` (WebKit main thread) | nav-morph (setter, listeners, cdwc), morph-gpu (rev 1 record, rev 2 P-098), morph-scroll stage A (fix-hero-exit-threaded) | **H** (end pin) |
| 21 | CSS-only GPU animations (scroll cue, vinyl, marquees, entries) | gpu-props §3.1 | CSS transform/opacity | transform, opacity | yes | time | already | — | see §4.4 (frame-rate cost) |
| 22 | input-only (language menu, modal, scroll-cue click, hover) | 2906-2925, 4143-4154, 12741-12746 | input | classes | — | input | — | — | — |

What is already compositor-only on the phone: #1, #5, #17, #18 (since today) and #21. What still moves from the main
thread in a place the finger feels: **#20 (end pin)**, **#3/#4 (hero window)**, **#6 (end pin, small)**. Rows 7, 10,
11, 14, 15 and 19 are main-thread *reads* on every scroll frame with no visible motion on a phone. Those are
"does less work" items, not GPU items, and they have owners.

## 3. Ranking

Criterion (lead, after C-026; research/gpu-props §5):
1. what the finger feels on the current best build (the top ~1000 px and the end pin);
2. main-thread frames at rest;
3. identity;
4. risk.

New weight from §1: continuous motion over a large area gains most from C9's higher frame rate. Discrete steps gain
nothing from it.

| rank | item | what moves off the main thread | where | identity | risk | state |
|---|---|---|---|---|---|---|
| 1 | #3 + #4 hero accent draw and boil (**accent-ca**, §4.3) | SVG layout per frame during 1.8 s of every 3.05 s (F-097, F-081: 434-445 of ~795 small Layouts per 20 s at rest), and stepped style ticks | hero window (63 of 81 long moving frames at y < 1000 on st6-rb2) | not identical: drawing → wipe; stepped → short fades | low technically; it is a user decision | drafts exist (10-02), never decided |
| 2 | #6 panel clock roll (P-097) | ~30 rAF/s for half of each second while the panel is open | end pin | same class as PR-017 (the user's near-identical decision has to cover it) | low; gated to m ∈ {0,1} | registered, owner fix-cd-roll-ca; no new topic |
| 3 | #20 end-of-page morph as compositor animations (**morph-ca**, §4.1) | the 680 ms tween's per-frame JS, style and (with morph-gpu) all of its layout; while the finger holds the pin | end pin: research/gpu-props §0.1 counts 91 long frames there on st6-rb2, median 20 ms | route A: same function of time, sampled (cd-roll-ca class, a proposal); route B: whatever stage A's proposal decides | high: the rounded clip has no WebKit compositor form; start cost (C7, F-207/208) on a big layer set | new; **on hold** until P-098 (open-start cost after rev 2) and the §4.4 frame-rate check: fix-morph-gpu reports rev 2 leaves little per-frame main work, so the gain may be mostly C9 (UNRESOLVED on device); the corner radius has no exact transform form |
| — | #9 fee progress `width` → scaleX | small per-frame layout in a mid-page loop | mid-page, at rest | needs a radius check | low | mention to rest-script's owner; not ranked (mid-page lag is cleared) |
| — | rows 7, 10, 11, 14, 15, 19 | per-frame reads with no phone-visible motion | everywhere | identical (do nothing on phones) | low | less-work items with owners (phone-invisible-shrink, nav-hit-test); not GPU |

Not candidates: #12 (an ellipse that narrows has no transform form), #2 (desktop load only), #16 (text).

## 4. Proposals (cost cards)

All three follow the pixel rule:
- frozen frames exact, or T2 within the PR-010 wide numbers (fill 64, edge 128, 0.5 %; Chrome and Simulator A/A);
- any difference that shows only in motion goes to the user as a proposal with Try-it pages (A and B), before it can land.

No timing A/B; landing evidence follows the less-work rule plus the phone no-worse check. morph-ca and accent-ca count as
smoothness fixes, so they keep the phone and finger test (memory/less-work-landing-rule.md).

### 4.1 morph-ca: the end-of-page morph as compositor animations (rank 3, new topic, on hold)

- **Owners.** This item touches three owners' code, so it is a cluster (TOPICS cluster B):
  - fix-morph-gpu: the reveal parts and their transforms, `__rvW` (end of nav block);
  - fix-nav-morph: the `--morph` setter, the listeners and the tween (12688-12699, 13013-13088), and the cdwc layering;
  - fix-hero-exit-threaded: morph-scroll stage A/B.
  Proposed lead: fix-morph-gpu, after rev 2 (P-098).
- **What moves off the main thread.** Today, while the tween runs, every frame has:
  - one rAF of the tween;
  - a `--morph` write on the nav and the reveal writer `__rvW`, about 12 inline writes;
  - style recalculation of the nav subtree;
  - on WebKit, a new clip-path shape on the nav layer.
  The finger's touch events land on the same thread during the tween: the listeners are non-passive
  while engaged.
- **Change.** The tween is a fixed function of time: 680 ms, easeOutCubic, from the value at the start to 0 or 1.
  At its start, compute every reveal part's transform/opacity keyframes once from `__rvW`'s own formulas, sampled
  at 240 Hz with `linear` between samples (cd-roll-ca's `__crPath` pattern). Play one `animate()` per part with a
  shared `startTime`. Commit the final inline values at the end. A reversal mid-tween cancels the animations and
  restarts from the current computed values.
  - Route B, on morph-scroll stage A: the same parts on a `view()` timeline of `div.fw-ms-end`. Every reveal value
    is linear in m: top, width, height, radius, colour mix, blur and the transforms derived from them. So two
    keyframes per part (m = 0 and m = 1) reproduce the per-frame values. Exact if the mapping from scroll to m
    stays linear. Safari 26.4+ threads it (CONFIRMED, research/gpu-props §0.3).
- **The blocker, first.** The nav's outer clip is `clip-path: inset(… round 32-12m px)`. WebKit never accelerates
  clip-path (research/gpu-props §2). Animating it alongside the transforms would leave the clip on the main thread
  while the contents move on Core Animation, so the two can drift apart by a frame. Candidate replacements:
  - the box edges as nested `overflow: hidden` wrappers, each translated by an edge offset and counter-translated
    inside (illusion-accent-wipe's technique). This is exact for straight edges;
  - the changing corner radius (32 → 20 px) has no transform form. Options: keep the radius fixed during the
    tween (a visible change, so a proposal), or build four corner masks scaled by r/32 (a circle scales to a
    circle; complex).
  **Feasibility step:** on the Simulator, no timing:
  - build the clip as wrappers;
  - frozen frames at 17 m values against morph-gpu rev 2, tiered by PR-010;
  - Layers mid-tween (all parts composited, no main-thread clip).
- **Expected gain.** All of the tween's per-frame main-thread work, for 680 ms per open or close, at the place where
  the finger still feels lag. On the iPhone, motion may be drawn at up to 120 Hz instead of 60 (C9, UNRESOLVED on
  device). Counts to show it:
  - Chrome: PipelineReporter compositor-only frames during the tween, as in §1.3;
  - Simulator: RenderingFrame and Recalculate Styles during a `__fwMorphDrive` open.
- **Risks.**
  - Start cost: C7 on about 10 parts. F-207/F-208 already measured +7 ms on the first frame at repeat opens for
    rev 1's promotion. Rev 2's "prepare before the tween" (`__rvPrepNow`) is the right base, because it keeps the
    parts composited before the start.
  - Backing stores held while running (F-201).
  - The panel clock: P-097's m ∈ {0,1} gate stays. The cdwc sub-pixel repaint rule applies to anything layered
    inside the panel.
  - Reduced motion: keep today's path.
  - Desktop: Chrome composites clip-path itself, so the clip blocker is WebKit-only. Desktop can keep today's code
    or take route A unchanged.
- **Identity.**
  - Route A: frozen frames equal to rev 2's at each m (same formulas). In motion it equals the original's 60 Hz
    path within sampling error, like PR-017. A motion difference goes to the user as a proposal.
  - Route B: per stage A's proposal.
  - Either way, the corner-radius choice decides between exact and a proposal.
- **Owners' answers (2026-10-04, agent messages).**
  - fix-morph-gpu: no objection, but rank it below items without a clip blocker. The rounded clip *is* the reveal.
    Rev 2's per-frame main-thread cost after the prep is already small (Simulator counts), and P-098 (phone, running)
    shows what is left at the open start. Hold route A until P-098 and P-099 are in. If the open start comes out
    no-worse, the gain is mostly C9's 80-120 Hz, which is unconfirmed on the device.
  - fix-hero-exit-threaded: WebKit's proximity snap only snaps within 0.3 × the scrollport of a snap point
    (WebKit main `Source/WebCore/page/scrolling/ScrollSnapOffsetsInfo.cpp` l.218-225). So a CSS-only route B can
    come to rest half open (p ≈ 0.3-0.7); it needs a JS settle (a hybrid). Stage B stays out of morph-scroll while
    it is UNRESOLVED.
  - fix-nav-morph: the setter must commit the final `--morph` at the end. The panel mount must stay out of the
    crossing frame; P-096 showed it is the big cost there.
  - Result: on hold (rank 3). It is reopened by the §4.4 check: if CA animations really run at 80-120 Hz on the
    phone, the case is the frame rate; if not, it is the leftover per-frame work, which P-098 measures.

### 4.2 Panel clock roll: P-097 as registered (rank 2, existing)

No new topic. P-097 (fix-cd-roll-ca, ticket rev 3 c8cbaeb0, ops read PASS) already extends PR-017 to
`.start-selling-morph-panel .waitlist-closing-countdown`, gated to m ∈ {0,1}.
Two additions from this study:
- (a) The same 80-120 Hz request applies to the panel roll (C9).
- (b) The C7 start/end cost is per roll. If the panel cells are not already composited between rolls, keeping them
  composited (the cell layers cd-strip creates, or `will-change`) avoids a promote/demote every second. That is a
  question for fix-cd-roll-ca's T-096 card: Simulator Layers between rolls.

### 4.3 accent-ca: the hero accent draw and boil on the compositor (rank 1, existing drafts → proposals)

- **Owners.** illusion-accent-wipe and illusion-boil-ca (de-illusion-style drafts, 2026-10-02, stacked on user-bplus).
  They are not proposals on the console yet.
- **What moves off the main thread.**
  - The draw: during 1.8 s of every 3.05 s, `stroke-dashoffset` on three SVG paths, which on WebKit is an SVG layout
    every frame (F-097, CONFIRMED). It becomes a static clip moved by counter-translated transforms (CA).
  - The boil and carets: `step-end` opacity is refused by WebKit's accelerator (CONFIRMED, F-048/F-065). It becomes a
    non-stepped opacity animation (CA).
- **Why now.** The hero window still holds most of the finger's long frames (research/gpu-props §0.1: 63 of 81 at
  y < 1000 on st6-rb2). With the hero exit threaded (v6), the accent is the last main-thread motion there besides
  the nav. C9 adds a smoother wipe on the phone. The boil is discrete, so it gains nothing from the frame rate,
  only the main-thread relief.
- **Risks.** Both drafts are visual changes: the drawing becomes a wipe, and the stepped flicker becomes short fades.
  The user decides; each option needs Try-it pages. The drafts must be restacked on main (v6 + cd-roll-ca) and
  re-checked (counts, frozen frames).
- **Ask.** The lead decides whether the owners rebase the drafts and publish them as one proposal with two items.

### 4.4 The one decisive check: do CA animations run at 80-120 Hz on our iPhone? (not a fix)

This single phone record answers three questions:
- why PR-017 feels much smoother, if the user felt it on the phone (§1.3, fit 1);
- whether morph-ca (§4.1) is worth reopening;
- the heat question below.
It needs the lead's call: it is a frame-rate record, not a gain A/B, but it does use the phone.

C9 means every running CA animation asks for at least 80 Hz. The page has always-on ones:
- the scroll cue float;
- the vinyl spin;
- the cred/reviews marquees (90 s);
- the panel column marquee;
- and now the countdown rolls (0.5 s of every second at the hero).
If iOS honours the request, the display and render server run faster while any of them is visible:
- a heat cost (milestone-2 heat profiles);
- a possible cause of F-071's unexplained ~80 Hz stretches in finger runs (80 is the range's minimum).
UNRESOLVED.
- **Decisive check, phone, when phone time returns.** An xctrace display-frame-interval record (not ioscap: it may
  be capped at 60 fps):
  - top of page, idle, with the countdown running against frozen;
  - the vinyl or marquee in view against paused.
- **Until then:** Chrome counts can't answer this. The Simulator's display does not show ProMotion.

## 5. Method, data and files

- Traces: fix-cd-roll-ca's `out/cd-roll-ca/full/` (C8/V9, r1-r3) and headed probes `probe-base-headed.json`,
  `probe-build-headed2.json` (its worktree, gitignored). Read only. Scratch scripts `pr.mjs` and `held.mjs` in the
  session scratchpad `gpu-lessons/`. They are not committed: one-off readers with no tool contract.
- Spring model: `GE` from JS 3789-3803, re-run offline at 60/80/120 Hz from rest, step distance 1 and 9 cells.
- Inventory: read-only helper over the whole JS file, CSS cross-checked against research/gpu-props §3.1 and the
  status board (2026-10-04 09:2xZ).
- Platform claims: ver-gpu-lessons cards C1-C7 and C9, with sources fetched via `gh` and direct doc fetches. C9 and
  C4's key lines were re-read by me.
- Nothing here was timed. Nothing ran on the phone or the Simulator. No Chrome lock was taken.
