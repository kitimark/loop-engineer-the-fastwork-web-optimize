# Unknowns on the render side: pipeline terms missing from our models (de-unknowns-render)

Scope:
- Render-pipeline terms that no note models yet: decode, layer memory and tiling, event regions, observers, GC,
  fonts, containment, and container queries.
- The y≈1960 post-mortem (the lead asked for it) and the y≈1250 frame.

Split with peers:
- de-unknowns-ux owns latency, touch path and judder.
- arch-unknowns owns validity, device state and statistics.

Labels as in the README: **vendor source** (WebKit main, fetched 2026-10-01, file:line), **data** (file named),
**derived**, **inference**. Read-only: no Chrome, no iPhone, no locks.

Data used:
- iphone-runner's Timeline captures `e-tc1`, `e-tc2` (aw1-10e control) and `e-ta1` (mw10e-na). Each is a
  `.json` + `.tl.json` pair in iphone-runner's worktree, `out/iphone-runner/`. 187 RenderingFrames per scroll pass.
- Segment stats come from a scratch script.

## 0. Verdict

1. **y≈1960 is solved, and the cause was not the morph panel.** Adding window wheel/touch listeners changes the root's
   event-listener region types. That schedules a **full style rebuild of every element**, then an event-region
   invalidation on every layer (§1). Arming once at setup ("na") takes the frame from 104/107 to 34/35 ms.
2. **Our iPhone frame logger forces a synchronous layout in every frame** (U1). It reads `scrollY` in the first rAF,
   and WebKit's `scrollY` runs `updateLayoutIgnorePendingStylesheets()`. So every "Layout inside rAF" in the phone
   Timelines is ours. In 1-2 frames per pass the page then dirties layout again, and the frame pays two full
   layouts (+12-17 ms).
3. **No layout on this page is cheap.** Every layout over 0.5 ms costs p50 12.1-14.0, p90 15-17.8, max 21-24 ms on
   the phone (U2). Each 41-53 ms frame outside y≈1960 is one such layout plus a 16-20 ms Composite. The lever is
   whatever dirties the root, plus containment. Nobody has measured either.
4. **Container queries force a layout inside style recalc** (U3, vendor source): 17 size containers. They explain
   the 19-27 ms Layout nested in RecalculateStyles in the rebuild frames, and the remaining 62 ms frame on the na
   build (y≈2678, U4).
5. **y≈1250 is not y-locked.** The long frames there recur every 200-300 ms over y 1249-1749. Each one is a forced
   full layout plus a GPU raster wait for the two 402×857 deck panels. Rough check: ~1.5 CSS Mpx × 9 = ~13.5 device
   Mpx at 0.6-0.9 Gpx/s = 15-22 ms, which matches the 16-20 ms Composite (U5).
6. **Image memory is about 10× what the layout needs** (U6): 577 MB decoded at full size. The morph panel holds
   62 MB for ~80 CSS px columns. Under memory pressure, iOS tiling shrinks coverage to the visible rect, which would
   turn every scroll into repaints. Unmeasured.

## 1. Post-mortem: the y≈1960 frame (86-129 ms)

### 1.1 What we assumed, in order

| step | hypothesis | basis | test | result (data) |
|---|---|---|---|---|
| 1 | `.pain` / section switch | position (y≈1960) | de-middle §2.3 | rejected: the frame starts at scrollY 1834-1867, where the morph IO fires (`rootMargin: 200%`, JS 13080-13088) |
| 2 | H1a "image burst": the IO mounts the hidden morph panel (`b`), and its 21 eager `decoding=async` images (62 MB decoded, JS 12890-12938) decode and paint | the mount condition `(s(b) \|\| s(E))` | mw10e-src (no `src`) | **86-97 ms, unchanged** (91 vs 88 control) |
| 3 | H1b "inert subtree": the hidden panel's `inert`/`tabindex` subtree is restyled and walked for accessibility | panel attributes follow E (JS ~13040) | noinert | **98/99/95 vs control 102/91/106, no effect** |
| 4 | the IO edge itself | e2, rootMargin 150% | e2 | the frame **moves** to y≈2240, so it is IO-triggered |
| 5 | split mount vs listeners | na (listeners armed once at setup) vs nb (no `b`, listeners still added at the IO edge) | na, nb | **na 34/35 vs 104/107 control; nb 84/101.** The listener add is the cost; the mount is not. |

### 1.2 What broke, and why we missed it

- We modelled event regions as a **paint-time term**: a null-context paint walk per layer (safari-render-signals
  §5). We never modelled them as a **style input**. In WebKit, the window/document wheel/touch listener types are
  an **inherited style property**. Changing them invalidates every element's style.
- The cost lands where nobody looks. `addEventListener` takes about 1 ms in Script. The bill arrives in the next
  frame's RecalculateStyles and Composite.
- H1a and H1b were both "what the IO mounts" hypotheses. The IO callback does two things: `z(b, true)` mounts the
  panel, and the effect `N()` (JS 13060-13066) adds `wheel {passive:false, capture}`, `touchstart {passive:true}`
  and `touchmove {passive:false}` on **window**. Only na/nb separated the two.

### 1.3 Corrected model (vendor source, WebKit main)

```
IO callback (13082) -> u = true; z(b, true) -> effect N(): window.addEventListener(wheel/touchstart/touchmove)
  -> LocalDOMWindow::addEventListener -> document->invalidateEventListenerRegions()
  -> Document.cpp 6590-6605: recompute root types (Style::Adjuster::adjustEventListenerRegionTypesForRootStyle,
     document + window listeners); if (changed) scheduleFullStyleRebuild()        // ResolveStyleType::Rebuild
  -> every element: computeEventListenerRegionTypes(..., parentStyle.eventListenerRegionTypes())
     (StyleAdjuster ~817; stored in StyleInheritedRareData.h 156)
  -> container-query containers defer their subtrees -> interleaved layout inside style (U3):
     Layout 19-27 ms nested in RecalculateStyles 34-43 ms
  -> RenderElement.cpp 993-1015: eventListenerRegionTypes changed -> layer->invalidateEventRegion(Style), every layer
  -> Composite 58-72 ms: Layout 14-18 ms, Paint of 4.43 CSS Mpx (430×922 viewport + all six 402×857 deck panels)
```

- Passive listeners count too: TouchStart is a region type of its own, beside NonPassiveTouchStart. So passivity
  changes the scroll latency, not the rebuild.
- Removing the listeners (`P()`, JS 13067-13073) changes the types back and pays again.

Timeline split (data):

| capture | frame | Style (layout inside) | Composite (layout inside) | JS |
|---|---|---|---|---|
| tc1 | 98-100 ms | 34.9 (20.8) | 58.0 (14.0) | ~1 ms |
| tc2 | 121-129 ms | 42.7 (26.6) | 72.0 (17.8) | ~1 ms |

### 1.4 Next actions, with registered predictions

Owner: fix-nav-morph. The gate on `O()` (`k = C() || (e > 0 && u && O())`) is in c7a8fd5.

- **F1/F2: arm once (at load or at idle) and never remove.**
  - Prediction at the y≈1960 frame: Style ≤ 3 ms, no Layout nested in Style, Composite ≤ 20 ms, the frame ≤ 45 ms,
    as na shows.
  - The arm frame itself pays one rebuild, about 80-130 ms. At load or idle the user doesn't see it. Check it with
    a Timeline over the arm.
- **The up pass.** Confirm that no `P()` runs on the way back up. If one does, the frame comes back at y≈1830 going
  up.
- **F3, only if F1/F2 lose on latency.** A non-passive touchmove on window makes the whole page a synchronous touch
  region (de-unknowns-ux U6). F3 scopes the listeners to `#platform` and the nav: those elements' subtrees restyle,
  not the whole document.
- **General rule** (posted as a pitfall): any runtime add or remove of a wheel/touch*/gesture listener on window or
  document costs a full rebuild on iOS. The cost is about 50-100 ms on this page. Arm such listeners once, early.

## 2. Page inventory (baseline, site-pretty, 1-based lines)

| term | count | where |
|---|---|---|
| raster images referenced | 190, **576.9 MB decoded** at full size; 90 with a side ≥ 1000 px; 76 progressive JPEG | scratch inventory (magic-byte sniffed) |
| morph panel images | 21, 61.9 MB decoded, 5.56 MB on the wire; roles/*.png 1282×1282 (6.6 MB each) for ~80 CSS px columns | JS 12890-12938 |
| hero covers | 10, 43.5 MB; peter-cover 1200×2133 (10.2 MB) eager + `decoding=async` | index.html |
| JPEGs named .png | 9 (service-quote/bg 736×1349, client-avatar-1..3, portrait-left/right, 3 ux-ui logos) | inventory |
| `<img>` in SSR | 113: 70 lazy, 98 `decoding=async`, 23 with width, 0 srcset; 3 AVIF `<source>` | index.html |
| size containers | 14 `.orbit-card` (`container-type: inline-size`, CSS 1600) + built-stage (6394) + 2 kr-arm (`size`, 6975); `cqw` at 1569, 6398, 6985-6993 | CSS 2.gBuqKVzi.css |
| will-change | 19 (morph 10457 width/height/border-radius; nav 11344 width/height/border-radius/background; .commission-card 42 ...) | CSS |
| containment | `contain: paint` ×1 (3472), `content-visibility` ×1 (11761) | CSS |
| backdrop-filter / filter / mix-blend / mask | 12 / 80 / 5 / 3 | CSS |
| infinite animations | 26 (three-frame boils 0.6 s step-end, carets, vinyl 3850, doc-sweep, marquees, morph columns 16 s) | CSS |
| text-wrap pretty/balance | 13 | CSS |
| IntersectionObservers / ResizeObservers | 11 (incl. threshold arrays at 2504, 11609, 11862, 12024, 12216) / 3 (2515, 3141, 4705) | JS |
| rAF calls / getBoundingClientRect / matchMedia | 26 / 27 / 30 | JS |
| web fonts | Google Sans latin+thai ×2 styles, Playpen Sans (CSS 2160), Fastwork Bold **TTF** (5162); all `swap`, none preloaded | CSS, index.html |
| canvas, video, Lottie, `decode()`, requestIdleCallback | 0 | JS |

## 3. Ranked unknowns

**EV** is the expected ms per affected frame, if the unknown resolves the way the evidence points.

| # | unknown | frames it could explain | EV | probe cost | owner |
|---|---|---|---|---|---|
| U1 | the phone frame logger forces layout | every "Layout in rAF"; 1-2 double layouts per pass | 12-17 ms × 1-2 frames; attribution of every pass | phone 10 min | arch-lead + toolsmith |
| U2 | why every layout is a 12-17 ms full layout | all 41-53 ms frames outside y≈1960 (6-9 per pass) | 8-12 ms each | phone Timeline 5 min | new: layout-containment |
| U3 | container queries force interleaved layout in style | the nested 19-27 ms in rebuild frames; na y≈2678 | 15-25 ms in rebuild frames | overlay + phone | fix-hero-exit (orbit) / new |
| U4 | what is left on na: the y≈2678 62 ms frame | the new worst frame after F1/F2 | 40-60 ms | phone Timeline 5 min | fix-nav-morph |
| U5 | the periodic deck repaint + layout at y 1250-1750 | the "y≈1250" 41-51 ms frames (3-4 per pass) | 15-20 ms each | phone LayerTree 10 min | new: people-deck |
| U6 | decoded-image memory and the iOS memory-pressure regime | any repaint-heavy frame; finger vs scripted gap | 0 or 10-20 ms per frame | phone 10 min | new: image-sizing |
| U7 | post-idle Composite inflation | first frames after rest (y≈23-50: 57/67 ms), morph after rest | 20-35 ms on 1-2 frames | phone 3 runs | de-pm-morph / fix-hero-exit |
| U8 | async decode on the panel's first visible paint | the first morph frames (blank columns, then repaint) | 10-30 ms once | phone Timeline | fix-nav-morph |
| U9 | other runtime region changes (up pass, vendors) | a y≈1830 frame on the way up; survey popups | 50-100 ms once | phone up pass | fix-nav-morph |
| U10 | font swap during the pass | a one-off relayout + repaint | 0 or 15-30 ms once | desk + log | new (small) |
| U11 | GC never captured | unexplained "Other" | 0-10 ms | Heap instrument | iphone-runner |
| U12 | event-region walk per layer | Composite in frames that create layers (y≈1340 burst) | 2-8 ms | overlay ablation | fix-scroll-engine |
| U13 | render-server offscreen passes (blend, mask, backdrop) | GPU-bound frames our WebContent Timeline can't see | unknown | Instruments | de-safari follow-up |

### U1. The iPhone frame logger forces a synchronous layout every frame (top: measurement integrity)

- **Evidence:**
  - *Code:* `tools/iphone.mjs` l.54 and l.147, and `out/iphone-runner/tlwin.mjs` l.32, push
    `Math.round(scrollY)` inside the first rAF callback.
  - *Vendor source:* `LocalDOMWindow::scrollY()` (LocalDOMWindow.cpp 1494-1508) calls
    `updateLayoutIgnorePendingStylesheets()` whenever scrollY ≠ 0. `innerHeight` (1400-1418) forces layout only in
    subframes.
  - *Data:* the Timeline attributes the 14.7 ms Layout at y=1249 (tc2) to `FireAnimationFrame 1435 → FunctionCall`.
    Its scriptName is "" and the stack is `loop` at 5:118, the injected logger.
  - *Data, double layouts (the harness layout, then a second full layout in Composite):*

    | capture | y | harness layout | layout in Composite |
    |---|---|---|---|
    | tc1 | 727 | 12.5 | 12.7 |
    | tc2 | 727 | 12.1 | 14.0 |
    | tc2 | 1749 | 16.9 | 16.4 |
    | ta1 | 736 | 12.3 | 12.1 |
    | ta1 | 1999 | 14.7 (top) | 12.2 |

- **Unknown:**
  - How much of the phone's long-frame count the logger itself causes. Without it, the update-rendering step lays
    out once, after all rAFs.
  - Whether Chrome's `--frame-log` (verify.mjs l.38-39, opt-in) has the same effect on Blink. Unchecked.
  - Every A/B arm pays it, so the deltas stay comparable. Absolute counts, and any attribution to "Layout in rAF",
    do not.
- **Probe:**
  - A logger variant that takes y from a passive `scroll` listener. Scroll events dispatch before rAF, and the data
    shows layout is clean there: `EventDispatch scroll 0 ms`. The rAF loop then records only `t`.
  - Run an A/A on the phone: 3 scripted passes with each logger on aw1-10e, under Timeline.
  - Count frames with more than one Layout > 0.5 ms, and the long frames > 34 ms.
- **Expect:** the double-layout frames drop by 12-17 ms, and the frame count > 34 ms falls by 1-2 per pass.
- **Owner:** arch-lead (protocol v2 logger section), with a toolsmith for `iphone.mjs`. Copied to arch-unknowns.

### U2. Every layout is a full 12-17 ms layout

- **Evidence (data, tlstat):**

  | capture | layouts > 0.5 ms | p50 | p90 | max |
  |---|---|---|---|---|
  | tc1 | 29 | 12.5 | 15.0 | 21.4 |
  | tc2 | 24 | 14.0 | 17.8 | 24.3 |
  | ta1 | 27 | 12.1 | 15.9 | 22.8 |

  - There are no layouts between 1 and 10 ms.
  - The Layout record's `root` is the 430×775 RenderView.
  - Each long frame outside y≈1960 holds exactly one such layout (rAF, top level or Composite), plus a 16-20 ms
    Composite.
- **Unknown:**
  - Which writes dirty the root.
  - Why the incremental path never applies.
- **Candidates (inference):**
  - viewport-unit boxes: `100svh` margins at CSS 2166/2368, and the sticky `.pain` stuck over y 1408-2958;
  - `%`/`min-height: 100%` chains;
  - text-wrap pretty/balance paragraphs (13) re-running line breaking;
  - container queries (U3).

  Containment is almost absent: one `contain: paint` and one `content-visibility`.
- **Probe:**
  1. Repeat the Timeline pass with `Timeline.start {maxCallStackDepth: 8}` (tlwin.mjs uses 1).
  2. Dump the `InvalidateLayout` stack in the two frames before each Layout > 0.5 ms.
  3. Chrome mechanism check, in the short lane: a counts-only probe reading `Layout` trace args
     (`dirtyObjects`/`totalObjects`, layout roots) over the same scroll:
     `node tools/lock.mjs run chrome-measure --owner <owner> --short --max-seconds 180 -- node <probe>`.
- **Expect:** if section-level `contain: layout style` (with `content-visibility: auto` off screen) cuts a layout to
  3-5 ms, each 41-53 ms frame loses 8-12 ms, and most fall under 34.

### U3. Container queries force an interleaved layout inside style recalc

- **Evidence (vendor source):**
  - `TreeResolver::updateStateForQueryContainer` (StyleTreeResolver.cpp 1531-1548) returns `SkipDescendants` for
    any visited element with size containment.
  - Its descendants are deferred (1461-1464). At the end of the pass `m_needsInterleavedLayout = true` (1586-1592).
  - `Document::resolveStyle` then loops `while (resolver.needsInterleavedLayout())`: it builds the render tree and
    runs `layoutContext().interleavedLayout()` (Document.cpp 2878-2885). This is a full layout inside
    RecalculateStyles.
- **Evidence (data):**
  - Layout nested in RecalculateStyles: 20.8 ms (tc1 y≈1957), 26.6 ms (tc2 y≈1977), 24.4 ms (ta1 y≈2678).
  - This happens in only 2-3 frames per pass: the frames whose style pass reaches a container.
- **Page:** 17 size containers (§2). 14 are hero orbit cards with `cqw` children (CSS 1569). The other three are
  1600's built-stage and the kr-arms.
- **Unknown:**
  - Which containers the rebuild frames visit.
  - Whether the nested layout is extra or only moved: the frame needs a layout anyway, but the interleaved one runs
    before the rest of the style pass, so a second one may follow.
- **Probe:**
  - An overlay variant with `container-type: normal` and `cqw` replaced by an equal `calc()` of the fixed card width.
    Equal pixels only where the container width is fixed: check that at 430 px.
  - Run it on the na build, Timeline over y 2500-2800 and an arm-at-load frame.
- **Expect:** 15-25 ms off each rebuild frame. Nothing in steady frames.

### U4. What is left on na: the y≈2678 62 ms frame

- **Evidence (data, ta1):**
  - `ObserverCallback IntersectionObserver` (0.3 ms, schedules a style recalc);
  - then RecalculateStyles 28.2 (Layout 22.8 + 1.6 nested);
  - then Composite 18.2 (Layout 15.9).
  - The control has a different frame near there: tc1 y=2734, 46 ms, Layout in Composite 21.4.
- **Unknown:**
  - Which IO fires. Candidates: the morph IO's `b` mount (now separate from the listeners), the scene gate, or a
    section reveal.
  - Whether it carries a style change wide enough to reach containers (U3).
- **Probe:** `R3_Y0=2600 R3_Y1=2760 node tldump.mjs ta1 50` with depth-8 stacks (U2's capture), on F1/F2. Read the
  ObserverCallback's function and line.
- **Expect:** 40-60 ms. If it is the mount, mount at idle like the listeners, or keep the panel mounted (owner's
  call).

### U5. The "y≈1250" frames: a periodic layout plus a deck raster

- **Evidence (data, tc2):**
  - Long frames at y 1249 / 1427 / 1592 / 1749, t = 1514 / 1719 / 1953 / 2151 ms, 200-266 ms apart. Each is
    41-53 ms.
  - Each frame: forced Layout 14.7-16.9 ms + Composite 17.3-19.6 ms, with Paint only 0.4-0.9 ms.
  - Paint clips: the deck panels 402×857 at x 14 and 406 (y 1177), plus 430×513, 430×304, 430×512 and 388×355 ×2.
    That is 1.35-1.6 CSS Mpx.
  - Rough check (derived): × 9 device px at 0.6-0.9 Gpx/s gives 15-22 ms. So Composite here is the GPU raster wait,
    not main-thread paint.
  - ta1 and tc1 show the same pattern (y 1236-1594).
  - The driver's flicks last about 300 ms, with `scrollend` at 1529 / 1829 / 2151 ms, and a 300 ms single-shot
    timer is re-armed each time. The phase of the long frame within a flick varies.
- **Unknown, three candidates:**
  - **(a) coverage:** at velocity 0, iOS coverage shrinks to the visible rect, and the off-coverage panels detach
    their backing (GraphicsLayerCA.cpp 3077-3101; TileController::adjustTileCoverageWithScrollingVelocity). The next
    flick re-attaches them and repaints them whole.
  - **(b) content:** something inside the panels changes about every 200 ms.
  - **(c) both.**

  The layout half is U2.
- **Probe:**
  - Enable the LayerTree domain during a scripted pass over y 1100-1800.
  - Log `layerTreeDidChange` counts and each deck layer's `paintCount` per frame.
  - Run a fling-and-hold variant: one long flick, no stops. Under (a), the long frames should drop to one at the
    start.
- **Expect:** 15-20 ms on 3-4 frames per pass. If (a): `contain: paint` plus a size that stays inside the coverage
  rect, or fewer off-screen panels. If (b): pause what runs in hidden panels.
- **Owner:** a new people-deck topic, coordinated with de-middle's R3 (the 373×344 feed repaint every frame).

### U6. Decoded-image memory and the memory-pressure regime

- **Evidence:**
  - Inventory (§2): 577 MB decoded across the page. The morph panel alone is 62 MB, and its 1282² roles PNGs cover
    about 240 device px.
  - Vendor source, GraphicsLayerCA.cpp 102-104 and 4891-4905: the iOS tiling threshold is 1280 px, 1024 at
    `systemMemoryLevel < 35`.
  - Under memory pressure, TileController coverage becomes the visible rect only, with no velocity margin.
- **Unknown:**
  - Whether WebContent reaches pressure during a pass. A finger pass is longer and dirtier than a scripted one.
    That could explain part of the finger-vs-scripted gap (arch-unknowns U3).
  - Whether decoded images are purged and re-decoded on re-entry.
- **Probe:** Web Inspector `Memory.startTracking` (categories: images, layers, page) over a scripted pass and a finger
  pass. Log `memoryPressure` events.
- **Expect:**
  - 0 if there is no pressure.
  - Otherwise 10-20 ms per frame on repaint-heavy frames.
  - The equal-pixel fix in any case: sized variants or srcset at 3× of the rendered size (the morph panel drops
    from 62 MB to ~5 MB).

### U7. Post-idle Composite inflation

- **Evidence (data):** the first scroll frames after the 3 s idle are tc2 y=23 (57 ms, Composite 31) and ta1 y=27
  (67 ms, Composite 39, Layout 22 inside Composite). Steady state is p50 ~1 ms, p90 7-10 ms of Composite minus
  Paint.
- **Vendor source** (RemoteLayerBackingStoreCollection.h 118-119, .mm 45):
  - back buffers go volatile after 200 ms (timer 200 ms);
  - the front buffer goes volatile after 1 s, but only for unreachable stores.
  - Also coverage at rest = the visible rect (U5a).
- **Unknown:** how much is re-attachment and how much is volatile buffers.
- **Probe:** scripted passes after 0.5 / 1.5 / 3 s of idle, 3 runs each. Take Timeline Composite of the first three
  frames.
- **Expect:** 20-35 ms on the first 1-2 frames, mostly irreducible. It matters for de-pm-morph's after-rest morph
  transient and for de-unknowns-ux's first-frame latency.

### U8. Async decode on the morph panel's first visible paint

- **Evidence:** `sN = <img loading="eager" decoding="async">` (JS 12876). The panel is hidden until the tween. On a
  new layer's first paint, async images that are not yet decoded paint blank and repaint later
  (safari-render-signals §5).
- **Unknown:** whether the 62 MB is still decoded by the first tween frame, or was purged (U6).
- **Probe:** the morph driver under Timeline. Count Paint records on the column layers in the first 10 frames. A
  second Paint of the same rect means the decoded image arrived late.
- **Expect:** 10-30 ms once, plus a visible blank (de-unknowns-ux).

### U9. Other runtime region changes

- **Evidence:**
  - `P()` (JS 13067-13073) removes the listeners when the IO leaves.
  - Hotjar adds document touchmove/mousewheel only in its survey/modal path.
  - A SvelteKit chunk (CzkAa0og.js:1192) adds a passive touchstart at load.
  - fix-nav-morph saw no other changes over 0→2600.
- **Probe:** one up pass on aw1-10e under Timeline. A rebuild frame near y≈1830 going up confirms `P()`.
- **Expect:** 50-100 ms once per crossing until F1/F2 land.

### U10. Font swap inside the pass

- **Evidence:**
  - Four swap faces, none preloaded. Fastwork Bold is a TTF.
  - Playpen sets `.pain-note p` (CSS 2286, text-wrap: pretty).
- **Unknown:** whether a face loads after the scroll starts.
- **Probe:** log `document.fonts` `loadingdone` timestamps in the pass logger. No device time; fold it into U1's
  logger change. Overlaps arch-unknowns U6 (network in the window).
- **Expect:** 0, or one 15-30 ms relayout + repaint.

### U11. GC is not captured

- **Evidence:** `Timeline.setInstruments {instruments: ['Timeline']}` (tlwin.mjs l.27), so no GarbageCollected
  records, and the gc total is 0.0 in all three captures.
- **Probe:** add `'Heap'` to the instruments in one pass.
- **Expect:** 0-10 ms. JS is ~1 ms per frame, so likely small, but the vendor scripts allocate.

### U12. The event-region walk per layer

- **Evidence:**
  - Vendor source: RenderElement.cpp 993-1015 invalidates a layer's region on touch-action, pointer-events or
    listener-type changes.
  - New composited layers need a region walk.
  - The page has `touch-action` at CSS 2252, 2348, 3405, 3461.
- **Probe:** an overlay without the two `pan-x pan-y` rules. Compare Composite in the y≈1340 layer-burst frames
  (F-045).
- **Expect:** 2-8 ms. Low priority.

### U13. Render-server offscreen passes

- **Evidence:** mix-blend ×5, masks ×3, 12 backdrop filters (§2). These run in the render server, outside
  WebContent's Timeline.
- **Probe:** Instruments' Animation Hitches template (de-safari §2.3).
- **Expect:** unknown. This only matters if Composite outlasts the raster estimate.

### Peer data after the first commit (de-pm-hero, postmortem-hero.md, commit 1d34ec8)

- **U1 is smaller than §0 implies.**
  - In de-pm-hero's payer census, 40 of 59 whole-view layouts of 10 ms or more are paid by the render update with
    no JS reader. Only the flip+60 frame holds a possible logger double.
  - The logger pays only when layout is already dirty at its rAF. "Layout in rAF = the logger" still holds, but the
    double layouts are rarer than "1-2 per pass" across all captures.
  - The A/A comparison of logger modes stays the cheap check.
- **U5(a) is weakened for one frame.**
  - In all 15 hero-block runs, the flip+940 frame comes 185-237 ms into a hold at y 1237-1250, and no flick follows
    it. Coverage re-attach predicts a repaint on the next flick, not during a hold.
  - That frame goes to Card 4 (the reveal end).
  - U5(a) can still own the frames at y 1490-1750 under the S driver, and the stationary hold frames. ST-2d
    ("fling-hold", in ST-2) decides.

## 4. Handed to peers, not analysed here

- de-unknowns-ux: perceived latency, the touch path, judder, the visibility of the y≈1960 frame.
- arch-unknowns: device state, warm/cold, driver coverage (U5's flick structure feeds its U3), statistics.

## Sources

- **Vendor source**, WebKit main, fetched 2026-10-01:
  - Document.cpp 2806-2900 (resolveStyle, interleaved layout loop), 6590-6605 (invalidateEventListenerRegions);
  - Element.cpp 2873-2877;
  - StyleTreeResolver.cpp 1448-1592;
  - StyleInheritedRareData.h 156;
  - RenderElement.cpp 993-1015;
  - LocalDOMWindow.cpp 1400-1418, 1494-1508;
  - GraphicsLayerCA.cpp 102-104, 3077-3101, 4891-4905;
  - TileController.cpp (adjustTileCoverageWithScrollingVelocity);
  - RemoteLayerBackingStoreCollection.h 118-119, .mm 45.
- **Data:**
  - iphone-runner's `out/iphone-runner/e-{tc1,tc2,ta1}.json` + `.tl.json` (worktree agent-a7696771bf38f1229);
  - na/nb/noinert/src results as reported by iphone-runner and fix-nav-morph.
- **Baseline:** `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`, `assets/2.gBuqKVzi.css`, `index.html`.
