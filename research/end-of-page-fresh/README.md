# End-of-page morph: an independent review and a design from zero

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). This doc
> names class names and line numbers of the frozen baseline and of local builds; keep it on local branches, never push.

**Owner:** arch-end-fresh (independent architecture review). The user asked for it in console thread T-228 #33
(2026-10-07 11:08Z); the lead spawned it. **Stage:** R/D (research and design). **Docs only:** no Chrome, Simulator or
phone run. Every number below comes from the cited README, card or finding. Claims about engines carry status words
(OBSERVED, CONFIRMED with a source path and line, REFUTED, UNRESOLVED). WebKit source was read with `gh` at main
`05dbfe1a59f6` and, where it matters for the phone, at `safari-7624.5.1.11-branch`.

Names used here:
- **v0** = the baseline page.
- **C** = v9-final rev 7d, the current best (JS 1b2eecc66011 / CSS e1359ab9994a).
- **CM** = compositor-morph (PR-030). **v13 / v13a** = C plus CM and its fixes c1-c3 / c3b-a.
- **P1** = PR-012 rev 1's clip-path reveal on v9-final (`fixes/end-morph-p1/`).
- **K / K6 / K8** = the CM pre-build variants.
- **m** = the morph value (0 = closed pill, 1 = open card).
- **D1** = the phone gate "first open after load, frame f2, V <= C + 4 ms".
- JS / CSS = `/_app/immutable/nodes/2.DyWL8TcE.js` / `/_app/immutable/assets/2.gBuqKVzi.css`.

## In plain words

- **The work was not wasted.** Every design so far removed most of the morph's paint. P1 even made the end zone
  smoother than C on the phone. CM made each open from closed faster than C once c3 landed.
- **One mistake keeps coming back.** Each design builds or resizes composited layers at the moment the card starts
  to open, and WebKit has no layer pool. So the cost lands in the open frame, and the first-open gate failed six
  times in a row.
- **The fix space is narrow and clear.** Build the card's layers once, in a still frame, and keep them built. After
  that, change nothing but transform and opacity, and never show or hide the structure again.
- **The user's two new complaints are about geometry, not speed.** The bar's items rise 4 px, and the corners "move a
  bit". v0 packed these small moves into a 0.68 s tween; morph-scroll stretched them over a whole screen of finger
  travel, where they can be seen. A from-zero design keeps the bar's items in a layer of their own that does not move.
- **Recommended:** design D1, the always-built card. CM's transform-only shape, built once at load idle and never torn
  down. The bar is a still layer of its own. The glass is not animated. No scroll timeline is attached at rest.
- **Main risk:** the always-built layers cost something on every scroll frame of the whole page. That is UNRESOLVED.
  A one-hour Simulator experiment (step S0) decides it before any build.

## 1. Mistakes, ranked by what they cost

Blunt, but every item names its evidence. Several were reasonable calls at the time; the ranking is by cost, not blame.

### M1. The same failure six times: layers created when the morph switches on

Each design changes which composited layers exist, or how big they are, in the frame where m leaves 0.

| design | what switches on at the open | phone result on the first open |
|---|---|---|
| morph-gpu rev 1 (PR-012) | `data-fw-rv`: the nav jumps to its final size, a clip-path mask layer appears, dark and glass divs | P-092: "first frame of an open is longer", kept out of the best build (`fixes/morph-gpu/README.md` 626-632) |
| morph-gpu rev 2 | divs and probe made early, but the switch to the panel-sized nav and the mask still at the open | P-098: O1.f1 +6.5 ms, WORSE; "the cost sits in starting the reveal itself" (morph-gpu 787-846) |
| P1 (PR-012 rev 1 on v9-final) | same switch as rev 1 | P-153: f2 +10 ms, "FIRST-OPEN RISK SEEN" (`fixes/end-morph-p1/README.md` 755-798) |
| P1 + (a) | same | P-156: Pr1 FAIL, f2 +11 ms; F-316 says it is Composite moved one frame earlier |
| CM v12 | the `display: contents` wrappers become boxes: 11 new layers on every open | P-159: D1 +9 ms (`fixes/compositor-morph/README.md` 736-741) |
| CM v13 (after c3) | same | P-160: D1 +11 ms, while D2 and D3 beat C (README 916-937) |

- The cause was named only on 2026-10-07, by the layer census and F-324. Every v13 open creates 11 layers, every close
  drops them, and WebKit keeps no layer pool (CONFIRMED in source, README 986-994).
- The K pre-build attacked the symptom: it switches the same structure on earlier, near the end. It inherited the
  switch's problems. The pre state does not look like the closed pill in Chrome. Rest style is 2-2.5x. It adds
  10.6 MB. In K6 the opens after a close still rebuild (README 997-1229).
- **Cost:** six phone blocks whose verdict was decided by this one effect. Add the c3b-K box (2 h), the K6/K8 builds and
  cards, and the P-161 set-up. A design rule ("no layer may be created or resized in the open frame; a Simulator
  census must show 0 per open") after P-092 would have stopped it on day one.

### M2. The simpler design with the better phone data was replaced by the more complex one

- **P1 on v9-final (P-153 block 2, G, Serious)** was better than C at every threshold in the end zone, and the arms did
  not overlap.
  - Frames over 34 ms per run: C 28-44, P1 20-21. Over 50 ms: C 1-9, P1 0-1.
  - After touchend, over 34 ms: C 16-19, P1 6-8.
  - Its one failure was the first open (M1); the f123 sum was equal (end-morph-p1 755-798).
- **CM v1.1 (P-157)** cut Paint to 0.28x, but showed no frame-time separation. Its over-34 share was V 0.014-0.015
  against C 0.015-0.024, inside the noise (compositor-morph 194-213, post hoc).
- These are different blocks and are never pooled. Still, nothing on record showed that CM bought more on the phone
  than P1 did.
- CM then replaced P1 on phones in v10 (README 332-342). Its complexity brought a run of new defects:
  - the end bucket that never reached m 1 (235-239);
  - the after-close transitions and the Join replay (118-129);
  - a 79-82 ms first-open frame (350-354);
  - rest restyle at m 1 (397-407);
  - the nolift regression through the earn keyframes (340-341);
  - the glass blink (794-822).
- **Cost:** about one day, and every CM card since P-157. The "GPU story" (playbook, F-317) became the frame for the
  area before the phone had shown that it paid more than the main-thread clip.

### M3. A one-frame gate decided the area

- D1 is a single frame per run (O1.f2), n = 4 per arm, bound +4 ms.
- It failed P1 and CM even though:
  - P1's f123 sum was equal to C's (paid back the next frame, F-316);
  - neither arm had a frame over 50 ms;
  - P1 cut the end zone's slow frames by a third.
- The bound was the right alarm for M1, but it was used as a veto on otherwise better builds instead of as a cue to
  fix the switch-on.
- **Cost:** P1 never landed (end-morph-p1 790-793). The work moved on to CM and K.

### M4. A 0.68 s tween was mapped onto one screen of scroll without asking which parts should follow the finger

v0's morph is one 680 ms ease-out-cubic tween, `ZM` / `YM` at JS 12688-12694. morph-scroll (PR-018) maps m linearly
onto the last screen of scroll. Every sub-motion of the tween now plays at finger speed over about 775 px:
- Nav `top: calc(16px + (12px - 16px) * var(--morph))` (CSS 11570; C 12101). It moves the bar's items 4 px up. This is
  the user's T-228 complaint.
- The insets (width 398 → 406 px) and the radius `calc(32px - 12px * m)` (CSS 11339). At m 0 the CSS overlap rule
  clamps the radius to h/2 = 26 px. It then jumps to 31.8 px by m 0.0166, about 13 px of finger travel, and shrinks to
  20 px over the rest of the screen. A likely source of the "corners move a bit" report: UNRESOLVED. The decisive
  check is a per-frame corner trace of the user's own gesture, or asking which corners.
- The 0.68 s ease-out did about 70 % of each move in the first 0.23 s (1 - (1 - 1/3)^3 = 0.70), so these small moves
  were hard to see. Over a slow finger they can be seen.
- **Cost:** two user complaints, and three days in which every design copied v0's geometry exactly while the motion
  that carried it had changed.

### M5. Bundled arms and moving targets

- v11 = Vc + V13 + H1c. v12 = v11 + X2 + c2 + PR-032 rev 3.
- P-159's V was switched from v11+c2 to v12 by a pre-data amendment (README 672-684).
- When P-159 failed (open-0 +17 ms), the cause turned out to be an interaction found after the fact: CM plus the nav
  cache re-measuring on each toolbar `resize` (782-793).
- **Cost:** one FAIL block whose cause no single delta could explain, and a late diagnosis (c3).

### M6. Predictions from counts to phone frame time were wrong in the same direction

| prediction | result | where |
|---|---|---|
| P-157 P1: Layout ~0 per morph frame | 1.00-1.04: MISS | README 175, 202 |
| P-159: PASS | FAIL | 663-669, 711 |
| P-160: PASS, about 55 % | FAIL by D1 | 899, 904 |
| c2: the open frame's layout came from `F()` | REFUTED by P-159's attribution | 765-767 |
| "first open is once per load" | REFUTED | 1055-1060 |

- Chrome and Simulator counts do not see layer build or Composite cost. The playbook knows this (pitfall 14), but the
  cards kept predicting PASS from them.
- **Cost:** the phone blocks were used as discovery tools rather than confirmations.

### M7. Chrome-first look gates missed WebKit-only defects, and one reached the user

- The stale clip at m 1 (morph-gpu 205-252) and the CM glass blink were caught only in the Simulator. The blink was
  caught only after the user's own swipe (C-103, README 794-805).
- Chrome capture artefacts consumed rounds: F-314 (RGBA vs RGB), F-315 (captureScreenshot corners).
- **Cost:** a visible regression shipped in a candidate, and two rounds of gate tooling.

### M8. Fixed, then broken, then fixed again

- st6-rb2 registered `--morph` with `inherits: false`, and the nav's children went stale on WebKit.
  - morph-inherit fixed it with six inline `--morph` writes per frame (`__mkW`, morph-inherit 60-72).
  - c3b-a #5 removed those writes again (README 968-969).
  - P-079's attribution had been taken on the broken morph (nav-morph 18-35).
- The glass blur:
  - v0 animates it per frame; CM put it on the scroll timeline, which caused the blink.
  - c3 wrote it inline per frame (glassD), which brought back a per-frame script write and a forced style pass of
    +2.3 ms (README 957-960).
  - c3b-a #2 removed the reader that paid for that pass.
- The closed panel's `visibility: hidden` rule was added and then dropped again (v9 12-16, F-268).
- Nolift (PR-027) was undone by CM's earn keyframes and restored by hand (README 340-341).
- **Cost:** each round was small; together, about half a day of builds and gates.

### M9. Phone time spent on overhead

- Every recent block ended at the heat ceiling after about 45 min: P-158 H10, P-159 H11, P-160 H11.
- A runner was killed by the 30-min background cap (I-240).
- P-161's first start was void because Safari was left on the timer page (F-325).
- Counted from the ledger, 19 blocks with data touched this area: 5 passed or held, 6 failed, 5 were insufficient
  or open, 2 were attribution-only and 1 was mixed.
- **Cost:** a phone hour per question, with about a quarter of the blocks decisive in the intended direction.

**What went right**, to be fair:
- source first: threaded scroll-driven animations, no layer pool, and `scrollY` forcing layout are all CONFIRMED;
- registered predictions and frozen kits;
- call-stack attribution found the toolbar re-measure (c3): open-0 frames went from 35.5 to 9.5 ms, better than C's
  19.25;
- the after-close rest probe caught two behaviour bugs before the phone.

## 2. What the evidence says the problem is

1. **The paint was the old problem, and it is solved.** CM and P1 both cut the morph's per-frame paint to about a
   quarter or less (P-157 Paint 0.28x; morph-gpu Simulator 12.3 → 2.3 paints per frame).
2. **The open frame is the current problem.** Any change in which layers exist, or how big they are, lands there,
   because WebKit builds layers lazily and keeps no pool. The backing store is painted in the first frame that shows
   the layer (README 1073-1080, F-324).
3. **The finger-following motion exposes v0's small sub-motions.** The user now judges geometry (4 px rise, corners),
   not lag.
4. **Rest work near the end has two sources, and only one is the morph's** (F-321):
   - at m 1, about 25 layouts per second rooted in the open panel: the panel countdown's rAF spring, which repaints the
     veil about 26 times per second (F-310);
   - at m -0.5, the platform section's own animations;
   - plus, in CM, a style pass per frame from the attached scroll timelines (F-319, 0.72 ms per frame on the phone,
     README 405).

## 3. From zero

### Ground rules that every design below keeps

- **R1. Build once, in a still frame.** Every composited layer the morph needs exists before the first approach. It is
  made at load idle, after hydration (F-307), and stays for the visit: no `display` toggle, no attribute switch that
  changes compositing, and no clip or mask that appears or disappears.
- **R2. After that, only transform and opacity** (plus a static filter) change while moving or opening.
- **R3. One timing source per frame.** Either everything the user sees follows the threaded scroll timeline, or
  everything follows the main thread. Mixing them lets a clip edge and the content it clips drift a frame apart
  under load.
- **R4. Rest is free.** No scroll timeline stays attached while the page rests (F-319), and no script runs at rest.
- **R5. The bar's items are still.** The logo, language button and Join live in their own fixed layer, outside the
  growing card. Their y never changes. The logo's horizontal move to the centre and Join's timed fade (PR-032 rev 3)
  stay, because they are part of the look. The card's top edge still moves 16 → 12 px, as in v0.
  - R5 is a deliberate change from v0 at m 1: the logo ends 4 px lower than v0's. It answers the user's request, so it
    goes to the user as a proposal item. The pixel gate scores the bar band separately.

### Engine facts the designs rely on

| fact | status | source |
|---|---|---|
| Qualifying scroll-driven transform / opacity / filter / backdrop-filter animations run threaded on iOS 26 | CONFIRMED | CM step 1: `UnifiedWebPreferences.yaml` 8316-8329, `PlatformEnableCocoa.h` 934-936 (7624 branch) |
| Every rendering update restyles each element with an attached scroll-driven animation, scrolling or not | CONFIRMED (source); OBSERVED on the phone | `ScrollTimeline.cpp` ~291, `KeyframeEffect.cpp` 2081-2088; P-157 row A |
| A completely accelerated, running **time-based** animation does not tick the main thread per frame: the timeline schedules its next tick at the effect's end | CONFIRMED | `KeyframeEffect.cpp` `ticksContinuouslyWhileActive` 2738-2761 (main 05dbfe1a) and 2667-2688 (safari-7624.5.1.11-branch); `AnimationEffect.cpp` 385-402; `DocumentTimeline.cpp` 351-410 |
| WebKit keeps no layer pool; each layer appear / disappear is a full build / teardown | CONFIRMED | F-324; `RenderLayer.cpp` 5865-5890 (main 616ee3ad) |
| An element with opacity 0 and no opacity animation has no backing store; `will-change: opacity` keeps one | CONFIRMED | `Styleable.cpp` 224-238, `RenderLayerBacking.cpp` 3880-3890 (main 05dbfe1a) |
| A box whose only decoration is a background colour is composited as a solid-colour layer, with no backing store | CONFIRMED (source; not probed here) | `RenderLayerBacking.cpp` `isSimpleContainerCompositingLayer` 3732-3765, `updateDirectlyCompositedBackgroundColor` 3515-3543 |
| A uniform rounded clip on a composited layer is a Core Animation `cornerRadius` with masksToBounds, not a mask layer | CONFIRMED | `GraphicsLayerCA.cpp` `updateClippingStrategy` 3287-3309 (main 05dbfe1a) |
| A clip-path change on a layer that composites its clip is RecompositeLayer (new mask path), not a repaint or a layout | CONFIRMED | `RenderElement.cpp` 341-346; `RenderLayerBacking.cpp` `updateMaskingLayer` 3238-3270, `updateMaskingLayerGeometry` 2041-2076 |
| clip-path does not shape a backdrop-filter: the backdrop rect comes from border-radius (or the legacy `clip`) only | CONFIRMED (source reading) | `RenderLayerBacking.cpp` `updateBackdropFiltersGeometry` 923-958 |
| clip-path / mask animations are main-thread in WebKit | CONFIRMED | F-269, `CSSProperties.json` (no accelerated wrapper for clip-path) |
| A scroll-driven backdrop-filter animation drops the glass when it attaches | OBSERVED (Simulator, 4 variants); mechanism UNRESOLVED | README 794-822 |
| Core Animation draws time-based CA animations at up to 80-120 Hz | CONFIRMED in source, UNRESOLVED on our phone | F-212 |
| A card-size backdrop clipped down by ancestors costs the GPU the same as a pill-size one | UNRESOLVED (Core Animation is closed source) | decisive check: S0 below, then the phone's page-wide Composite |

### D1. The always-built card (threaded): RECOMMENDED

**Mechanism.** WebKit touch phones only (the existing `__msOn` gate plus `'GestureEvent' in window`, as K6). Every
other device keeps C.

- Layers, all made once at load idle with `will-change: transform` (no opacity animation on the frame layers, so they
  get no backing store):
  - **Frame:** CM's four corner clippers `c0..c3`, each with its counter-scaled box `u0..u3`. This is the minimum for a
    rounded box whose width, height and radius change independently by transforms alone: each clipper is a large
    rounded square scaled by k = r/32 at one corner (README 1019; CA `cornerRadius`, no mask layer). At m <= 0 they
    sit at the pill's geometry and draw the closed pill **at every scroll position**, so there is never a second
    rendering of the closed state to swap to. That swap is what broke K's look (README 1011).
  - **Inside u3:**
    - `D`: a solid #131922 box, opacity m. It is a solid-colour layer (no backing store) and equals v0's
      `color-mix` exactly (F-039).
    - `Gc`: the card glass: white 10 %, static `backdrop-filter: blur(20px)`, never animated.
    - `P`: the panel parts (backdrop, veil, centre, footer, columns). They are at their final layout, positioned by
      transforms on the scroll timeline (CM's linear and grid keyframes), with `will-change: opacity, transform`, so
      their backing stores are painted once at idle, not in the open frame.
  - **Pill glass `Gp`:** today's pill-size nav glass, outside the frame. It shows only at m <= 0, and Gc only at
    m > 0. They swap by opacity, 1 ↔ 0 and 0 ↔ 0.9999 (F-225: never exactly 1). The swap is one keyframe step on the
    scroll timeline at m = 0+, so no script and no layer build is involved.
    - Far from the end only Gp draws, so the page-wide blur cost is today's.
    - Pixel risk: the blur at the pill's bottom edge differs between a pill-size and a card-size backdrop. K6 measured
      this in the Simulator as 0.32-0.34 %, max 26-59, inside T2 (README 1124-1133).
  - **Bar `B`:** the logo, language switch and Join. A fixed layer above the frame. It never changes y (R5). The logo's
    x-centring is a scroll-timeline translate (1 element). The language switch's 4 px slide and Join's timed fade stay
    as in v13a.
- **Glass blur 20(1-m) without an animated backdrop-filter.** v0 shrinks the glass blur as the card darkens. D1 keeps
  Gc's blur static at 20 px. The dark layer D covers it in proportion to m.
  - The pixel error is about (1 - m) x |blur20(B) - blur20(1-m)(B)| over the backdrop B. That backdrop is `#platform`,
    already blurring by 12 m / 0.55 px and fading, so the error is expected to be small.
  - UNRESOLVED. Decided by the pixel gate (S5) at m 0.004-0.6. The fallback is c3's glassD: one inline write on one
    element per frame (main-thread style only).
- **Timelines attach only while needed (R4).**
  - The scroll-driven `animation-name`s apply under `html.fw-cm-live`.
  - That class turns on at `touchstart` (passive, already listened to by `__msTouchEv`) or when an
    IntersectionObserver on the runway reports the end zone within one screen. Both happen before or far from a
    moving morph frame, and the keyframes' values at m <= 0 equal the closed CSS, so attaching changes no pixel.
    F-162's pending first frame is covered by CM's inline first-frame values, as today.
  - The class turns off when the 7d settle has come to rest at m 0 or m 1 for 300 ms. Static CSS then holds the two
    rest states (`html.fw-cm-open` for m 1).
- **Panel clock** (not the morph's, but it is the end panel's rest cost): its rAF spring becomes one Web Animation per
  second-tick (the cd-roll-ca technique, F-154). With that, 25-26 layouts or repaints per second at m 1 become about
  one style pass per second. This is a separate item for its owner (the panel-clock-layer attempt was a layer, not a CA
  roll).

**Predicted cost.**

| | main thread | compositor |
|---|---|---|
| moving frame | style for the elements with attached timelines: 4 clippers, 4 boxes, D, the Gp/Gc swap, about 6 panel parts and the logo, about 18 (CM: ~15 in Chrome). 0 layout and 0 paint from the morph (P-157 row A: no layout from the timeline itself) | transform and opacity updates of about 18 layers |
| open frame | the class flips CM already makes; 0 layers created, 0 backing stores painted (target, gated in S3) | the same as a moving frame |
| rest at m 0 or m 1 | 0 from the morph (timelines detached); panel clock about 1 per second after its fix | static |
| page-wide (top of the page) | 0 | about 11 always-composited layers that draw nothing (frame, D at opacity 0, Gc at opacity 0), plus Gp as today |
| memory | | about C's: frame layers and D have no backing store; P's stores already exist in C after its lazy mount (`b` at the platform IntersectionObserver, JS 13209-13211), here made at idle instead |

**Risks.**
1. The page-wide composite of the always-built frame: four nested `masksToBounds` and `cornerRadius` layers, fixed over
   the scrolling page. Core Animation may render rounded clips with sublayers in an offscreen pass every frame.
   UNRESOLVED. S0 counts it in the Simulator; the phone block reports Composite at the top of the page as a
   descriptive item.
   - Mitigation: an `opacity: 0` ancestor over the frame while the page is more than three screens from the end.
     Whether Core Animation skips a hidden subtree is UNRESOLVED. Opacity on a group does not drop backing stores
     when `will-change: opacity` is set (Styleable.cpp 233-234).
2. K's rest-style surprise. With the pre state on, K6 restyled 2-2.5x at rest, even with the timelines paused, "with
   the bigger styled tree under `.is-morphing`" (README 1151-1154, OBSERVED, cause unknown). If an always-built tree
   restyles at rest by itself, R4 fails page-wide. S0 tests exactly this, with the timelines detached.
3. The still-glass look (above), with glassD as the fallback.
4. R5 is a look change at m 1 (the bar's 4 px). It is a user decision, offered with Try-it.

**How it differs from CM and K.**
- CM switches its wrappers between `display: contents` and boxes on every open and close. D1 never does.
- K turns the same switch on earlier. D1 has no switch at all, so there is no "pre state".
- D1 adds three things CM and K lack: the bar as a still layer, the static glass, and no timelines at rest.
- It keeps CM's real asset: the transform-only rounded box, which is threaded and follows the finger even when the
  main thread is late under heat.

### D2. The always-built clip card (main thread, P1 made persistent)

**Mechanism.**
- One fixed card at its final size (406 x 751 at 12, 12 for 430 x 775), composited from load idle.
- Its visible box is `clip-path: inset(t r b l round R)`, kept on the element at all times, so the mask layer exists
  from the start. At m 0 the inset is the pill.
- Panel parts and the logo are positioned by transforms written in the same rendering update as the clip (R3: all on
  the main thread). They come from `__msTick`, which already runs per scroll frame, or from one registered
  `inherits: false` property per part.
- The glass cannot use the clip-path (the backdrop rect comes from border-radius only, source above). So the glass is
  a sibling empty box whose width, height and border-radius follow v0's formulas (as P1's `.fw-rv-glass`). That is
  one small out-of-flow layout per frame, and a backdrop-rect update with no repaint (no painted content: a solid
  colour at most).
- The bar is a still layer, as D1.

**Predicted cost.**
- Per frame: style of about 8 elements, one layout of one fixed box, one RecompositeLayer for the clip path.
  0 paint (CONFIRMED mechanism, see the table).
- Open frame: nothing created, because the mask and the layers already exist.
- Rest: 0.
- Phone evidence for the per-frame part already exists: P1 cut the end zone's slow frames by a third (P-153).

**Risks.**
- **Stale clip at m 1.** The reveal stays cut to the last clip box after the clip changes stop. It was OBSERVED in the
  Simulator, the cause is UNRESOLVED, and it is unchecked on the device (morph-gpu 205-252). The workaround toggled
  the nav's backdrop-filter, which would be a per-arrival switch.
- **Page-wide offscreen pass.** A CAShapeLayer mask on a final-size fixed layer likely costs an offscreen pass per
  composited frame for the whole visit. UNRESOLVED.
- **Main-thread timing.** Like C, the card follows the finger only as well as the main thread keeps up. Under heat it
  lags, where D1 would not.
- P1 at rest on m 1 was not pixel-exact in Chrome (130k px, morph-gpu 241-245): this needs re-checking for a
  persistent clip.

**How it differs from CM and K.** One mask instead of eight clipper layers, no keyframe grids, exact v0 formulas for the
shape. Unlike P1, nothing switches on or off.

### D3. v0's 0.68 s tween, played by Core Animation (a proposal)

**Mechanism.**
- D1's always-built layers, but no scroll timeline.
- The open is triggered when the runway is entered, through an IntersectionObserver sentinel on `.fw-ms-end`
  (passive; no scroll-jack, no pin, no non-passive listener).
- One `element.animate()` group plays v0's exact curve:
  - ease-out cubic = `cubic-bezier(1/3, 1, 2/3, 1)` (F-038);
  - keyframes laid out in time for the non-linear parts (F-216's one-cubic-per-piece method);
  - 680 ms.
- Close: the same group reversed from its current time (reading `currentTime` forces no style).
- The 7d settle stays for the page itself.

**Predicted cost.**
- Per frame: **0 main-thread work** (CONFIRMED: an accelerated time-based effect does not tick continuously, see the
  table). Core Animation draws it at up to 120 Hz.
- Open: one style pass and one commit. Rest: 0.
- This is the floor for any design.

**Risks.**
- **It does not follow the finger.** The user chose finger-following twice: PR-018 rev 7 (2026-10-04) and PR-023
  rev 5. So it is a proposal, and likely to be rejected as the whole morph.
- **Mid-tween reversals** under a fast swipe need a rule for where the reverse starts.

**Use it anyway for:**
- the cost floor in the Chrome and Simulator count gates (an arm that shows what "nothing on the main thread" reads
  as);
- the mechanism for the small sub-motions if the user prefers them snapped. For example, the top edge's 4 px, the
  insets and the corner radius could play as a 0.68 s Core Animation tween at the open threshold while the height
  follows the finger. That is a motion change, so it would be a Try-it option, not a fix.

### D4. Canvas or image sequence: rejected

- Memory: one 3x frame of the open card is 1218 x 2253 device px x 4 bytes = 11 MB decoded. A 60-frame scrub is about
  660 MB, and a video would decode on every scrub step.
- The card shows live content that no pre-rendered frame can hold:
  - the blurred `#platform` and end screen behind the glass;
  - the panel countdown;
  - the column marquee.
- So it cannot be pixel-identical at every frame (memory illusion-must-be-pixel-identical), and a canvas would paint on
  the main thread every frame.
- Not pursued.

### Comparison

| | D1 always-built card | D2 always-built clip | D3 Core Animation tween | CM (v13a) | K6 |
|---|---|---|---|---|---|
| follows the finger | yes, threaded | yes, main thread | no | yes, threaded | yes, threaded |
| layers created per open | 0 (target) | 0 (target) | 0 | 11 | 0 on the first open after a pre-on rest; 11 on later opens (README 1180-1184) |
| main-thread work per moving frame | style about 18 | style about 8 + 1 tiny layout + recomposite | 0 | style about 15-40 + glass write | as CM |
| rest at m 0 / m 1 | 0 / 0 (+ clock) | 0 / 0 (+ clock) | 0 / 0 | style per frame / style per frame (F-319) | 2-2.5x near the end |
| bar items still | yes | yes | yes | no (4 px rise) | no |
| glass | static, cross-fade (glassD fallback) | sibling box | static | inline write per frame | as CM |
| phone evidence for the moving part | CM's (P-157, P-160 D2/D3) | P1's (P-153) | none | P-157, P-160 | none (P-161 pending) |
| main unknown | page-wide cost of the always-built frame; rest style of the tree | stale clip; page-wide mask | the user's taste | | |

## 4. Recommendation and prototype plan

**Recommend D1.** It keeps what the phone has shown to work: CM's threaded, transform-only shape (P-160: open-0 frames
9.5 vs 19.25 ms) and P1's evidence that removing the paint makes the end zone smoother. It removes the one effect that
decided six blocks (M1), and it answers the user's bar complaint by construction. D2 is the fallback if S0 shows that
the clipper frame costs too much page-wide. D3 is the cost-floor arm and a possible Try-it option.

**The main risk:** the always-built frame's cost on every frame of the whole page (Core Animation's nested rounded
clips, and whether the tree restyles at rest by itself, as K's pre state did). The first step tests exactly that,
before any build.

Gates in the project's order (playbook §3). Counts and looks only until the phone; no timing verdicts (memory
defer-timing-focus-call-tree). Times are agent hours.

| step | what | pass | time |
|---|---|---|---|
| S0 decisive, before building | On the frozen c3b-a build (`out/cm/c3ba`, read-only copy), variant A0: after the first open, CM's wrappers stay boxes after the close (no `display: contents` back); timelines detached at rest. Simulator (shared lane, weight simulator, `k-sim.mjs` passes O and A, `o1-sim.mjs` census): (a) layers created on opens 2+; (b) rest style and layouts per second at m 0 and m -0.5 with the tree built, against c3b-a; (c) a scroll segment at the top of the page with the tree built and hidden, against c3b-a (paints, Composite rank) | (a) 0; (b) within 1.3x c3b-a's A/A; (c) within the A/A spread | 1-1.5 h |
| S1 build | D1 on c3b-a: tree at load idle; bar layer outside the frame; Gp/Gc swap; attach/detach rule; glass static | `node --check`; class parity (`c2trace.mjs`) 0 differences | 3-4 h |
| S2 Chrome counts | `cm-chrome.mjs` open/close 40 steps; layer census | layout 0 per moving frame; paint ≤ CM's; style ≤ CM's + 3 elements | 0.5 h |
| S3 Simulator counts | `cm-sim.mjs --cold --stack 6`; `o1-sim.mjs` census on the first and the later opens | layers created per open 0 on every open; open-frame paints ≤ 2; no forced layout in the open frame | 1 h |
| S4 rest probe | `k-sim.mjs` pass A segments at the top, at m -0.5, 0 and 1; rest after the close (CM's 500 ms windows) | per-second style and layouts ≤ C's + A/A; nothing repaints after the close | 1 h |
| S5 pixel look | `pre-look.mjs` / `cm-px2.mjs --capture screencast`, Chrome and Simulator, 775 and 815, A/A floors, stops pre .. 1 .. down 0. Bar band scored apart (R5 is a declared change) | T2 outside the bar band; the bar band = only R5's 4 px | 1.5 h |
| S6 layers and memory | census at the top, m -0.5, 0, 0.5 and 1 | no layer created between stops; memory ≤ C + 3 MB | 0.5 h |
| S7 phone block | P-160's rules (D1-D3), G fast-short, tool-serious, C vs D1; descriptive: Composite per frame at the top of the page, rest style at m 1 | PASS by P-160's rules | 1.5 h with heat |
| then | Try-it for the user: D1 against C, plus the R5 bar and, as a second option, D3's snapped sub-motions | the user's pick | |

Total: about 10-12 agent hours and one phone block. S0's kill rule: if (a) is not 0, or (b) or (c) fail, stop D1 and
take D2 through the same gates (its S0 is the same experiment with P1's persistent clip).

## 5. Claims to verify before they are used as facts

- **Core Animation offscreen passes for nested `masksToBounds` + `cornerRadius` with sublayers, and for a CAShapeLayer
  mask.** UNRESOLVED (closed source). Decisive: S0 (c) and the phone block's descriptive Composite.
- **Whether a hidden (`opacity: 0`) Core Animation subtree is skipped at composite.** UNRESOLVED. Decisive: S0 (c) with
  and without the hidden ancestor.
- **The cause of K6's rest style with the pre state on.** OBSERVED, cause unknown (README 1151-1154). Decisive: S0 (b).
- **The static-glass cross-fade error.** UNRESOLVED. Decisive: S5 at m 0.004-0.6.
- **That the "corners move" report is v0's geometry at finger speed** (radius kink at m 0.0166, 4 px insets).
  UNRESOLVED. Decisive: a per-frame corner trace of the user's gesture, or one question to the user.
- **Backing stores of `will-change: opacity` layers at opacity 0 are painted at idle, not in the first visible frame.**
  The source shows they exist (Styleable.cpp 233-234); when they are painted is UNRESOLVED. Decisive: S3's open-frame
  paint count.

## Sources

- `fixes/compositor-morph/README.md` (CM, P-157 to P-161, c1-c3b, K), `fixes/end-morph-p1/README.md` (P1, P-153),
  `fixes/morph-gpu/README.md` (PR-012, P-092, P-098, stale clip), `fixes/morph-scroll/README.md`, `fixes/v9-best/README.md`,
  `fixes/BEST_BUILDS.md`, `research/architecture/gpu-compositor-playbook.md`.
- Findings F-036, F-038, F-039, F-062, F-162, F-212, F-216, F-225, F-269, F-307, F-309, F-310, F-316, F-319, F-321, F-324.
- WebKit, read with `gh` (read-only): main `05dbfe1a59f63860bce30ddff7113da859fd2636`: `GraphicsLayerCA.cpp`,
  `RenderLayerBacking.cpp`, `RenderElement.cpp`, `StyleDifference.cpp`, `Styleable.cpp`, `KeyframeEffect.cpp`,
  `AnimationEffect.cpp`, `DocumentTimeline.cpp`, `WebAnimation.cpp`; `safari-7624.5.1.11-branch`: `KeyframeEffect.cpp`.
- Code map (helpers map-end-fresh and map-end-history, read-only): v0 tween JS 12688-12694, trigger 12975-13077, nav
  CSS 11320-11361 and 11565-11584; C nav `top` CSS 12101, morph-scroll JS 14173-14470.

## 6. S0 result (2026-10-07 11:39-12:00Z; Simulator only, counts only)

> **Correction (S1, §7):** the A0/A0b CSS below was broken: the corner-clipper rules were dropped, and the kept pill had
> no glass. The A0/A0b rows are replaced by §7's D1 rows. The BA (c3b-a) and K6 (v14) rows stand.

The lead's go was "S0 with the pass/fail rules as written, at least 3 runs per arm". The lead later added: report v14
too, because any D1 build must now beat v14 (c3b-a + K6, the current best), not C.

**Verdict.**
- **(a) layers created per open: FAIL as written, by 2 small layers.** The kept tree cut the layers made on every open
  from 26 to 2, in every open of every run. The 2 left are the logo and the language-switch wrap: bar items, which D1
  takes out of the frame anyway (R5).
- **(b) rest at m 0 and m -0.5: PASS.** The kept tree rests like c3b-a. v14 restyles every frame at rest near the end.
- **(c) top of the page: PASS.** Within c3b-a's spread.
- **Next step (my call; the lead rules on the strict (a)): build D1 (S1), not D2.** S1's first check is that the bar
  items, in their own still layer, make 0 layers per open.

### Arms and run plan

Frozen copies in this worktree's `out/s0/` (gitignored, read-only copies of arch-compositor-morph's frozen builds plus
my variants):

| arm | what | JS / CSS sha256/12 |
|---|---|---|
| BA = c3b-a | `out/cm/c3ba` copy | 4175a56193ab / 9c1067cff473 |
| A0 | c3b-a, but the CM tree is kept built once warm (`__cmWarm`) or first prepped. `html.fw-cm-keep` applies the `.is-morphing` structure rules; at rest the closed pill is drawn by the frame with static m 0 values inline (`__cmClear` writes `__cmVals(0)` instead of removing them); `will-change` on every animated part. The scroll-driven animations still attach only under `.is-morphing`, so none is attached at rest | e24afb108b63 / dc27f7137cd9 |
| A0b | A0 + the logo kept `position: absolute`, and the language-switch wrap kept at `translateX(0px)` with `will-change: transform` at rest (an attempt at A0's 2 left-over layers) | e24afb108b63 / 52a9bdacd550 |
| K6 = v14 | `out/cm/c3bk6` copy | d23ee885d54f / 4fafb83f1e72 |

- Tool: `research/end-of-page-fresh/s0-sim.mjs` (WDA finger strokes, `LayerTree.layersForNode` census, Timeline
  segments).
- Six Simulator sessions in the shared lane (weight simulator, 300 s cap), arm order alternating:
  - BA/A0 sessions 1-3;
  - A0b/K6 sessions k1-k3.
- Per arm and load: 4 open/close strokes from m -0.3. Then rests of 3 s at m -0.5 and at m 0, a 2 s rest at y 600
  (top of the page), and 60 rAF scroll steps from y 600 to 3000.
- Host: load1 max 84-162 in sessions 1-3, 13-25 in k1-k3 (I-082). Simulator ms are a rank only (F-084); none decides
  anything here.
- A0 and A0b are cost experiments, not look-checked builds. At rest the nav is drawn through the frame with m 0 values,
  page-wide.

### (a) Layers created per open (all OBSERVED, Simulator, in our setup)

| arm | layers new at each open (4 opens per run) | runs | which (resolved by node) |
|---|---|---|---|
| BA c3b-a | 26, 26, 26, 26 | 3 / 3 | c0-c3, u0-u3, dk, bar, logo, actions, language switch and its wrap, Join and its box, panel parts … (the per-open build, F-324) |
| A0 | 2, 2, 2, 2 | 3 / 3 | the logo (93x24, 0.14 MB) and the language-switch wrap (74x37, 0 MB) |
| A0b | 2, 2, 2, 2 | 3 / 3 | the same two |
| K6 v14 | 3 on the first open, then 5, 5, 5 | 3 / 3 | first: dk, logo, language-switch wrap; later opens add the panel centre (406x389, 5.68 MB) and the footer (406x89, 1.29 MB) |

- The tree that stays built removes 24 of the 26 layer builds per open. This holds on every open, not only the
  first.
- A0b's two changes did not keep the logo and the language-switch wrap built. So "the position switch and the
  transform none → some cause them" is REFUTED for these two layers. The cause is UNRESOLVED.
  - The decisive check is a census with the bar items moved out of the frame, as D1 does (S1).
  - Note: in A0 the logo is inside u3 and has `will-change` too.
- **v14's later-open rebuild, attributed.** On every open after a close, v14 builds the panel centre and footer again:
  two painted layers, 7 MB. The CM README left this UNRESOLVED at lines 1180-1184; it is now OBSERVED here.
- Layers and memory in the census (layer count / estimated MB):

| arm | held open | closed |
|---|---|---|
| BA | 55 / 95.7-97.3 | 54-56 / 102.7 |
| A0 | 53 / 78.8 | 61-63 / 85.8 |
| K6 | 55 / 95.7-97.3 | 60-62 / 106.2 |

- So the kept tree holds 7 more layers at rest, which draw nothing, but about 17 MB less memory than c3b-a in both
  states. That is OBSERVED, cause unknown, and needs checking in S6 before anyone relies on it.

### (b) Rest near the end (rendering-step style recalcs and layouts per 3 s rest; forced 0 in every arm)

| arm | m -0.5: style recalcs | m -0.5: layouts | m 0: style recalcs | m 0: layouts |
|---|---|---|---|---|
| BA c3b-a | 81, 80, 87 | 51, 58, 66 | 18, 18, 18 | 8, 8, 7 |
| A0 | 96, 86, 79 | 66, 66, 66 | 18, 17, 18 | 8, 8, 8 |
| A0b | 70, 93, 86 | 51, 66, 66 | 18, 18, 18 | 7, 8, 8 |
| K6 v14 | **205, 203, 205** | 66, 51, 66 | **181, 179, 181** | 8, 8, 7 |

- **The rule:** the arm's max must be ≤ 1.3 x BA's max, which is 113 at m -0.5 and 23 at m 0.
- **A0 passes:** max 96 and 18. Its median is 86 against BA's 81 (1.06x). Its layouts at m -0.5 sit at BA's max.
- **v14 fails the same rule clearly:** about 2.5x at m -0.5 and 10x at m 0. That is a style recalc on every rendering
  frame while resting with the pre state on, as the CM README found (2-2.5x, lines 1140-1154).
- **The kept tree itself does not restyle at rest.** That answers README §5's open question "K6's rest style with the
  pre state on": its cost comes from the pre state's attached animations or classes, not from the tree existing.
  OBSERVED; the exact rule is still UNRESOLVED.

### (c) Top of the page with the tree built (after the 4 cycles)

| arm | 2 s rest at y 600: style recalcs / layouts / paints | 60-step scroll y 600 → 3000: paints / layouts (forced) / style recalcs (forced) |
|---|---|---|
| BA c3b-a | 92 / 66 / 141; 102 / 63 / 151; 79 / 27 / 110 | 237 / 33 (59) / 9 (29); 275 / 40 (69) / 12 (37) |
| A0 | 92 / 67 / 135; 74 / 28 / 87; 94 / 67 / 132 | 223 / 37 (71) / 13 (35); 210 / 39 (67) / 12 (34) |
| A0b | 74 / 26 / 86; 77 / 28 / 91; 74 / 28 / 86 | 237 / 47 (77) / 17 (39); 202 / 41 (72) / 12 (35); 156 / 32 (58) / 8 (30) |
| K6 v14 | 80 / 26 / 109; 75 / 27 / 107; 80 / 37 / 125 | 304 / 37 (77) / 11 (35); 285 / 38 (72) / 13 (32); 272 / 32 (59) / 10 (30) |

- **A0 lies inside BA's spread** on every count, and the kept tree costs no visible extra work while scrolling the top
  of the page. OBSERVED, Simulator.
- The scroll segment has 2 runs for BA and A0: the second arm of sessions 1 and 2 recorded no segment, a fault of the
  tool, fixed for k1-k3.
- The Core Animation side (GPU composite of the nested rounded clips) is still not visible to these counts. It stays
  UNRESOLVED until the phone block's descriptive Composite at the top of the page (README §5).

### What it means for D1

- **The main hypothesis holds.** The per-open layer build is the cost of tearing the tree down. Keeping it removes 24
  of 26 builds per open, and it costs neither rest work nor work at the top of the page in the Simulator.
- **Against v14** the kept tree does better on both of v14's known costs:
  - v14 still builds 3-5 layers per open, and 7 MB of painted panel layers on every later open;
  - v14 restyles every frame at rest near the end.
- **Next (proposed): S1, the D1 build on c3b-a,** with the bar as its own still layer outside the frame.
  - Its first gate is this census with a target of 0 per open, the logo and language-switch wrap included.
  - Then S2-S6 as in §4, with v14 as the arm to beat.
- **If S1 still shows the two bar-item layers** after they leave the frame, their cause is the next question (a
  census per CSS rule), not a reason for D2.

## 7. S1 result: D1 on c3b-a (2026-10-07 12:05-12:40Z; Simulator and Chrome only, counts and frozen frames, no phone)

**First, a correction to §6: the A0 and A0b CSS of S0 was broken.**
- **The clipper rules were dropped.** When I duplicated the CM structure selectors for `html.fw-cm-keep`, the four
  corner-clipper rules (`:is([data-fw-cm="cN"], [data-fw-cm="uN"])`) were split into invalid selectors. An invalid
  selector drops the whole selector list, so the `.is-morphing` versions went too. In A0/A0b the clippers had no place
  and no transform origin, also while morphing.
- **The kept pill drew no glass.** u3's glass rule had no kept twin.
- **How it showed:** in S1's first Chrome look run the nav was invisible at rest, and taps went to the page.
- **What it voids:** §6's A0/A0b numbers describe a broken build: 26 → 2 per open, the rest counts, and "about 17 MB
  less", which was really the missing glass.
- **What stands:** S1's D1 below re-measures all three on a corrected build and replaces §6's A0 rows. §6's BA
  (c3b-a) and K6 (v14) rows stand.

**Verdict.** Gates 1, 2, 3 and 5 PASS. Gate 4 (look) shows three items over T2. By the lead's rule each one becomes a
proposal item with Try-it, not a silent change. One of them, the bar hold, is the same item as arch-compositor-morph's
c3b-d option B.

| gate | rule (lead) | D1 result | pass |
|---|---|---|---|
| 1 layers per open | 0 per open, first and later, 3 runs (logo and language-switch wrap waived) | **1** on every open of every run (4 opens x 3 runs): the language-switch wrap only. c3b-a: 26 | PASS (the waived item) |
| 2 rest style | m -0.5 and m 0 within 1.3 x c3b-a's spread; v14 is the arm to beat | m -0.5: 105, 85, 88 (c3b-a 61-89 over 6 runs, limit 116); m 0: 18, 18, 18 (c3b-a 18 x 6). v14: 203-205 and 179-181 | PASS; v14 does 2.3x more at m -0.5 and 10x more at m 0 |
| 3 top of the page | within c3b-a's spread, 3 runs per arm | every count inside c3b-a's spread (table below) | PASS |
| 4 look | T2 against v14 at m -1..1, at 775 and 815, Chrome + Simulator A/A | Chrome: m ≤ 0 is 0 px at both heights (top, mid, far, -1 .. 0, 0d, -0.5d); m > 0 differs only by the bar hold. Simulator: the bar hold, plus two items on the kept closed pill (below) | 3 items over T2, each a proposal item |
| 5 bar row still m 0 → 1 | the bar row holds still | tap centres of the logo and buttons: y 42 at every stop from m 0 to 1 (v14: 42 → 38), in Chrome and the Simulator | PASS |

### Build

`out/s0/d1`: JS 0b1999106111, CSS c65e6d527803. The diff against c3b-a (JS 4175a56193ab / CSS 9c1067cff473) is
`s1-d1.diff`.
- **The tree stays built once warm, in WebKit only.** As in A0, `__cmKeepOn` runs from `__cmWarm` and `__cmPrep`, and
  `__cmClear` writes `__cmVals(0)` inline. It is now gated on `'GestureEvent' in window`.
- **Why Chrome is left out.** In Chrome the kept closed pill drew square right corners. c3b-a and v14 show the same
  square top-right corner at m 0.1 and 0.25 in Chrome (OBSERVED, Chrome, deterministic in the A/A pair), and
  arch-compositor-morph is checking it. Chrome keeps c3b-a's teardown, which is why Chrome's m ≤ 0 is 0 px.
- **The bar hold** is c3b-d option 1 (arch-compositor-morph): `v.bar = { translate: 0px 4px }`, and the actions keep
  their x slide. The bar stays inside u3. Its "own still layer" is done by holding its key constant, not by moving it
  out of the frame; that is enough for gates 1 and 5.
- **The CSS keep twins are fixed:** the four clipper rules and u3's glass.
- **The logo is `position: absolute` while kept and not morphing,** as under `.is-morphing`. Without that it sat 16 px
  right of today's place: the logo key's x was added to its flow position.
- **The language-switch wrap** gets `transform: translateX(0px)` while kept at rest. That did not remove its layer
  (gate 1).

### Gate 1: layers created per open (Simulator, `s0-sim.mjs`, 3 sessions, order alternating; all OBSERVED)

| arm | new layers at each open | which | held open: layers / MB | closed: layers / MB |
|---|---|---|---|---|
| D1 | 1, 1, 1, 1 in all 3 runs | the language-switch wrap (74x37, 0 MB), every time | 55 / 95.7-97.3 | 67 / 112.5 |
| BA c3b-a | 26, 26, 26, 26 in all 3 runs | c0-c3, u0-u3, … (F-324) | 55 / 95.7-97.3 | 54-56 / 102.7 |
| K6 v14 (§6) | 3, then 5, 5, 5 | dk, logo, wrap; later also the panel centre and footer (7 MB) | 55 / 95.7-97.3 | 60-62 / 106.2 |

- **The one layer left is the language-switch wrap.** The logo is now kept.
- **Its `translateX(0px)` at rest did not keep it.** That REFUTES "a transform switch at the flip makes it". Its cause
  is UNRESOLVED.
  - The next suspect is the timed Join fade (PR-032). It moves the wrap with a `translate` transition at the m 0.2 flip,
    and a running transition gets its own layer for as long as it runs.
  - Decisive check: the same census with the timed fade's transition off.
- **The census sees it as made at each open and never as gone,** while the closed count stays at 67. Most likely it is
  made per transition and dropped by a later commit, which the census does not show as a "gone". UNRESOLVED.
- **Cost of keeping:** 11-13 more layers and +9.8 MB at rest against c3b-a, and +6.3 MB against v14. The glass and the
  clippers stay built, and none of them draws anything new at rest (gate 2). OBSERVED; these are Simulator estimates
  from `LayerTree` sizes, not phone memory numbers.

### Gate 2: rest near the end (style recalcs per 3 s; layouts; forced 0 in every arm)

| arm | m -0.5 style | m -0.5 layouts | m 0 style | m 0 layouts |
|---|---|---|---|---|
| D1 | 105, 85, 88 | 66, 64, 66 | 18, 18, 18 | 8, 8, 8 |
| BA c3b-a (S1 runs) | 89, 61, 75 | 66, 51, 66 | 18, 18, 18 | 8, 8, 7 |
| BA c3b-a (§6 runs) | 81, 80, 87 | 51, 58, 66 | 18, 18, 18 | 8, 8, 7 |
| K6 v14 (§6) | 205, 203, 205 | 66, 51, 66 | 181, 179, 181 | 8, 8, 7 |

- **At m -0.5** D1's max is 105, against a limit of 1.3 x 89 = 116. Its median is 88, against c3b-a's 80.5 (1.09x).
- **At m 0** D1 is identical to c3b-a.
- The m 0 rests come after a close. arch-compositor-morph's S0b/S0c take the same path and match (v14 177/181 there).

### Gate 3: top of the page with the tree kept (after the 4 cycles; Simulator)

| arm | 2 s rest at y 600: style / layouts / paints | 60-step scroll y 600 → 3000: frames / paints / layouts (forced) / style (forced) / composite ms |
|---|---|---|
| D1 | 79 / 26 / 108; 77 / 26 / 109; 81 / 28 / 111 | 25 / 203 / 31 (61) / 9 (32) / 605; 28 / 216 / 36 (64) / 7 (32) / 611; 29 / 264 / 38 (68) / 13 (34) / 699 |
| BA c3b-a | 81 / 32 / 117; 80 / 44 / 126; 78 / 33 / 116 | 27 / 270 / 35 (68) / 9 (32) / 660; 27 / 235 / 36 (66) / 13 (32) / 662; 30 / 268 / 37 (69) / 7 (36) / 656 |

- Every D1 count is inside c3b-a's spread, §6's c3b-a runs included (paints 237-275, layouts 33-40). Composite ms is
  a rank only (F-084).
- These counts still cannot see the Core Animation cost of the kept nested rounded clips at the top of the page. That
  stays for the phone block, as §6 said.

### Gate 4: look against v14 (frozen frames, PR-010 multi-pair A/A, `s1-look.mjs`)

`s1-look.mjs` is a copy of arch-compositor-morph's `pre-look.mjs` with two more stops: `top` (y 0) and `mid` (half way
to the end zone). D1 keeps the tree for the whole page, so the closed nav away from the end zone is part of its look.
Stops at m ≤ 0 have no held touch; stops at m > 0 are held (`--touch`).

Chrome (430 wide, DPR 3, screencast frames), consistent px beyond A/A:

| stop | 775 | 815 |
|---|---|---|
| top, mid, far, -1, -0.75, -0.5, -0.25, 0, 0d, -0.5d | 0 | 0 |
| 0.1 | 0.31 %, max 145 | 0.29 %, max 146 |
| 0.25 | 0.29 %, max 135 | 0.22 %, max 118 |
| 0.5 / 0.5d | 0.45 %, max 136 | 0.38 %, max 178 |
| 0.75 | **0.64 %**, max 188 | 0.45 %, max 216 |
| 1 | **0.53 %**, max 226 | **0.50 %**, max 225 |

Simulator (iPhone 15 Pro Max, device pixels), consistent px beyond A/A:

| stop | share, max | where | reading |
|---|---|---|---|
| top | 0.058 %, max 212; logo cluster 192 css px2, max 150 | the logo | **item L**: an edge over 128 |
| mid | **0.60 %**, max 150; 2,227 css px2 at max 20 inside the pill | the pill glass and the logo | **item G** (over 0.5 % and over 2,000 px) and L |
| -1 | 0.57 %, but A/A noise 1.2 % and V/V 3.7 % | the profile cards under the pill | noise-dominated (load phase) |
| -0.5 | **0.71 %**, max 50, flat share 0.94 | the left half of the pill glass | **item G** |
| 0 | 0.18 %, max 57 | the pill glass | within T2 |
| 0.25 / 0.5 / 1 | 0.65 % / 0.72 % / 0.51 %, max 136 / 179 / 226 | the bar row | **item B**: the bar hold |
| 0d | 0.44 %, max 39 | the pill glass | within T2 |
| -0.5d | **0.80 %**, max 30 | the pill glass | **item G** |

Taps: 0 differences at every m ≤ 0 stop in both engines. At m > 0 only the bar row's own y differs: 42 against v14's
41 to 38.

Proposal items; none may be changed silently:
- **B, the bar hold:** from m 0 to 1 the bar row is up to 4 px lower than v14's. This is the same item as c3b-d option
  B in arch-compositor-morph's proposal (A v14 / B held / C late), and D1 takes the user's pick.
- **G, the kept pill's glass (Simulator only):** a fill difference of 20-57 levels over 0.6-0.8 % of the screen,
  inside the closed pill, while the tree is kept.
  - Cause UNRESOLVED. Suspect: the backdrop blur runs on the card-size u3 (406x791) under the four clippers, so it
    samples the page outside the pill, where v14's pill blurs only its own box. See §3 engine facts: the backdrop rect
    comes from border-radius, not from the clip.
  - Decisive check: a Simulator look stop with u3's blur moved at rest onto a pill-size child.
- **L, the logo at the top and mid page (Simulator only):** an edge difference of 150-212 over 192 css px2, at the
  logo, while the tree is kept.
  - Cause UNRESOLVED; most likely a sub-pixel position, the logo key's translate against today's left inset.
  - Decisive check: the logo's `getBoundingClientRect` in both arms.

### What it means

- **D1 does what it is for, in the Simulator:**
  - 1 layer per open instead of 26;
  - rest work equal to c3b-a, and 2-10x below v14;
  - no extra work at the top of the page;
  - a still bar row.
- **Before a phone block D1 vs v14,** G and L should be fixed or shown to the user. They change the look of the closed
  pill in WebKit, page-wide. A phone block on that build would measure a look the user has not seen.
  - My proposal: one more S1 step for G and L (Simulator only, about 45 min).
  - The alternative: card the phone block now and put G and L to the user as Try-it items in parallel.
- **Tools:** `s0-sim.mjs` (census, rest, top of the page) and `s1-look.mjs` (look). Data: `out/s0/runs/` and `out/s1/`
  in this worktree (gitignored).

## 8. S1b: G and L fixed (D1b), opens after a close against v14, and the phone card draft (2026-10-07 12:42-13:30Z)

The lead's go for (a) was: fix G and L in the Simulator only; put the bar mechanism behind one flag; gate G and L with
the bar both on and off; when the look is within T2 in Chrome and the Simulator (with A/A), commit and send the phone
card draft (D1 vs v14, tool-serious, C V V C).

**Verdict.**
- **The look is within T2 in both engines with the bar flag on v14.** With the bar on `held`, only item B remains: the
  bar row is held, which is PR-033's decision.
- **Gates 1-3 still pass.**
- **Opens after a close match v14** (k-sim pass O, 12 opens per arm). D1b's frame 1 is cheaper. The f2 cost seen in two
  early sessions did not repeat. It was session noise, not a cost the design moves into f2 (see the table).
- **The card draft is below. The phone arm is D1b with `__cmBarMode = v14`,** so the block measures D1's layers, not
  the bar choice.

### Causes and fixes

- **G, part 1: the bar items were backdrop roots** (CONFIRMED).
  - S1's kept-tree CSS gave the bar, logo and actions `will-change: transform, opacity, filter`.
  - In WebKit, will-change with opacity or filter makes an element a backdrop root: WebKit main 86d0164f83,
    `Source/WebCore/style/values/will-change/StyleWillChange.cpp` 183-193 (`canBeBackdropRoot`), used at
    `Source/WebCore/rendering/RenderLayer.cpp` 672-683.
  - So the language button's own blur saw only the actions box behind it, and drew darker than today's.
  - Fix: `will-change: transform` only, on those three.
- **G, part 2: u3's blur sampled outside the pill.**
  - The closed pill's glass was u3's backdrop blur. u3 is panel-sized under the four clippers.
  - The backdrop rect comes from the element's own box and radius (§3 engine facts), so the blur sampled the page
    outside the pill.
  - Fix: while kept and closed, the glass is on the bar, as in v14's pre state (c3b-K2): `#ffffff1a`, `blur(20px)`,
    radius 32. u3's backdrop is `none !important` there (it beats `__cmClear`'s inline value).
- **L: the logo was drawn alone in a layer at a fractional y.**
  - A Chrome rect probe with a GestureEvent stub (`out/s1/rect.mjs`) shows the logo's box identical to v14's in every
    arm: 32, 30.375, 91.5 x 23.25 at the top, mid page and -0.5.
  - So the difference was not position. With its own layer (will-change) at y 30.375 the logo was drawn up to
    150-212 levels off at its edges. The likely mechanism is how a separate layer is placed on device pixels, which
    stays UNRESOLVED.
  - Fix: `will-change: auto` on the logo while kept and closed. It gets its layer at the open with its animation, as on
    v14. That makes it one of the two waived per-open layers again.
- **The bar flag:** `__cmBarMode` in the JS, with three values:
  - `held` (PR-033 option B);
  - `v14` (A: today's 4 px rise);
  - `late` (C: held to m 0.6, then the rise; keyframe grid [0, 0.6, 1]).

Builds (`out/s0/`, gitignored; `s1b-d1b.diff` against c3b-a, sha256/12 c83b5fa8237a):

| arm | bar mode | JS | CSS |
|---|---|---|---|
| D1b | held | 2346001b1ed8 | 2ab0464e540a |
| D1b-a | v14 | 30ff7c0d1ad5 | 2ab0464e540a |

### Look against v14 (s1-look.mjs, multi-pair A/A; consistent px beyond A/A)

| stop | Sim, bar held (D1b) | Sim, bar v14 (D1b-a) | Chrome 775 / 815, bar held | Chrome 775 / 815, bar v14 |
|---|---|---|---|---|
| top, mid, -0.5 | 0 | 0 | 0 | 0 |
| -1 | 0.30 %, max 25 (A/A noise 1.7 %) | 0.30 %, max 25 (A/A 2.1 %) | 0 | 0 |
| 0 | 0.04 %, max 57 | 0.04 %, max 57 | 0 | 0 |
| 0.25 / 0.5 / 1 | 0.18 / 0.28 / 0.39 %, max 136-226 (item B) | 0 | 0.22-0.64 %, max 118-226 (item B) | 0 |
| 0d / -0.5d | 0.30 / 0.32 %, max 25 / 26, flat | 0.30 / 0.32 %, max 25 / 26, flat | 0 | 0 (775 0d: 0.017 %) |

- Every stop with the bar on v14 is within T2:
  - fill ≤ 57 ≤ 64;
  - ≤ 0.32 % ≤ 0.5 %;
  - ≤ 1,276 css px2 ≤ 2,000;
  - no edge item.
- The 0d / -0.5d fill difference (max 25-26) is the kept pill's glass after a close, against v14's own glass after a
  close.
- Taps: 0 differences at every stop with m ≤ 0 in both engines.
- G is gone: mid and -0.5 were 0.60 % and 0.71 % in S1, and are now 0. L is gone: top was a logo edge at max 150-212,
  and is now 0.

### Gates 1-3 on D1b (Simulator, `s0-sim.mjs`, 3 valid sessions)

Session 1's D1b arm did not open: its strokes stopped at m -0.3, and S0 had 30 frames per 3 s. Its numbers are void.
Sessions 2-4 are valid.

| | D1b | c3b-a (sessions 1-4) |
|---|---|---|
| layers new at each open (4 per run) | 2, 2, 2, 2 in all 3 runs: the logo (92x24, 0.14 MB) and the language-switch wrap (74x37), both waived | 26 every open |
| held open / closed: layers, MB | 55 / 95.7-97.3; 66 / 113.1 | 55 / 95.7-97.3; 54-56 / 102.7 |
| rest m -0.5 style per 3 s | 94, 85, 81 | 77, 96, 85, 75 (limit 1.3 x 96 = 125) |
| rest m 0 style per 3 s | 18, 18, 18 | 18 x 4 |
| top scroll: frames / paints / layouts (forced) | 28 / 220 / 36 (66); 30 / 260 / 39 (72); 26 / 203 / 37 (59) | 27 / 266 / 36 (68); 29 / 291 / 37 (71); 27 / 241 / 32 (64) |

- The glass moving from the bar to u3 at the open built no new layer in the census.
- D1b's top-of-page paints are at or below c3b-a's range. Every other count is inside it.

### Rest, measured the same way as arch-compositor-morph (its k-sim.mjs at ef5c631a, `--pass A --rest0`, one session)

Style recalcs in the rendering step per 3 s:

| segment | v14 | D1b |
|---|---|---|
| S-0.5a (m -0.5 after an open) | 202 | 99 |
| S-0.5z (3.5-6.5 s later) | 230 | 117 |
| S0 (first reach of m 0) | 42 | 33 |
| S0b (m 0 after a close) | 177 | 10 |
| S0c | 180 | not recorded: the 300 s cap ended the session |

D1b has no scroll animation in effect at rest: its generated keyframe rules are scoped to `.is-morphing`. That fits
F-330 (WebKit ticks every in-effect scroll animation on each rendering update): v14's pre state keeps 8 of them in
effect, D1b none. OBSERVED; the mechanism is F-330's.

### Opens after a close (k-sim pass O; Simulator composite ms per open, frames f1-f3; rank only, F-084)

| arm | opens | f1 median | f2 median (max; opens > 20 ms) | f3 median | f1-f3 sum median | paints median |
|---|---|---|---|---|---|---|
| v14 | 12 (4 sessions, both orders) | 31.9 | 4.4 (35.8; 4) | 21.5 | 58.3 | 34 |
| D1b-a (bar v14, the phone arm) | 12 (same sessions) | 25.5 | 2.9 (39.1; 4) | 23.3 | 53.0 | 27 |
| D1b (bar held) | 9 (3 sessions) | 25.1 | 14.7 (67.7; 3) | 8.6 | 55.8 | 33 |
| D1 (S1) / D1b without the logo fix | 3 / 3 (1 session) | 20.9 / 23.5 | 2.6 / 3.1 | 6.5 / 1.1 | 27.9 / 27.2 | 19 / 19 |

- On the phone arm D1b-a, every median is equal to or below v14's, and D1b-a has the same count of f2 > 20 ms opens.
- The 58-68 ms f2 frames came from D1b's first two sessions only. In the three-way session (D1, D1b, D1b without the
  logo fix) they did not repeat, so neither suspect (the glass move, the logo layer) explains them. Simulator session
  noise; the phone block's open-0 read decides.

### Phone card draft (for the lead to sign; written before any phone data)

Built on P-161's card (fixes/compositor-morph/README.md, "P-161"). Everything not named here is as there.

| item | value |
|---|---|
| ticket | P-NNN (from the lead) |
| question | Does D1b open no worse than v14 under the finger? D1b keeps CM's layer tree built in WebKit and draws the closed pill through it with no scroll animation at rest. The opens checked: the first open after load, and every open from closed. |
| arms | C = v14 (c3b-a + K6), JS d23ee885d54f / CSS 4fafb83f1e72 (`out/s0/k6`, a copy of P-161's V). V = D1b with `__cmBarMode = v14`, JS 30ff7c0d1ad5 / CSS 2ab0464e540a (`out/s0/d1b-a`; `s1b-d1b.diff` with the flag line set to v14). The bar motion is the same as v14's in both arms, so the block measures D1's layers, not the PR-033 bar choice. |
| snapshot | `out/fe/snap2` (C from out/s0/k6, V from out/s0/d1b-a, read-only), HASHES 7c9ade106f49, checked by the kit before every hold |
| kit | `research/end-of-page-fresh/phone/`: fe-serve.sh, fe-block.sh and fe-hold.sh are copies of `fixes/compositor-morph/phone-c3bk6/` with these pins and no probe page. fe-run.sh runs the block. Dry run 13:2xZ: 3 of 3 servers serve the pinned hashes; H1, H3 and TAIL DRY ok; programs fs 8737f212c0ff and pr 7ff27a2413c8 ok. Reader: `fixes/compositor-morph/phone-c3bk6/p161-read.mjs` (selftest 8 checks ok) on `out/fep1/runs`. |
| P-161/P-162 lessons in the kit | (1) tool-serious through `iphone.mjs rearm`, with `FW_PHONE_CONDITION=tool`; no Xcode step is ever posted (user T-228 #15). (2) Safari is parked before every rearm (c181d248). (3) `thermal.mjs clear` runs in fe-run.sh after `lock.mjs run iphone` returns, not in an exit trap (b161bece). (4) New in fe-block.sh: a locked phone (preflight AUTH, exit 10, at the part start or after a failed hold) posts ONE console step, "unlock the iPhone", from inside the hold, waits for its Done (up to 3600 s), restarts WDA and Safari, then re-runs the hold once instead of exiting. (5) The hold is marked `--block <ticket>`. |
| driver, profile, order | As P-161: G fast-short (8737f212c0ff), Timeline on in every counted run, tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`). H1:WC H2:WV, then EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (C V V C C V V C), then H11:TAIL with the end sentinel. Link loss as P-161. |
| command | `sh research/end-of-page-fresh/phone/fe-run.sh P-NNN` as a Bash background job (timeout 7200000 ms). It starts the servers, runs `CM_TICKET=P-NNN CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-end-fresh --block P-NNN --max-seconds 3600 --keep 120 -- sh research/end-of-page-fresh/phone/fe-block.sh H1:WC … H11:TAIL`, then `thermal.mjs clear`, then stops the servers. |
| metrics and decision | P-160/P-161's, unchanged, with C = v14. D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median over runs of the per-run open-0 median dt, V - C <= +4 ms. D3: open-0 share at T in {34, 30, 38}. PASS / FAIL / OPEN as in P-160. |
| descriptive (no verdict) | The per-run count of finger-down frames > 50 and > 34, with their twins, per arm. |

**Prediction (frozen with this commit).**
- **D1: PASS, about 60 %.** Both arms reach the first open with their layers already built: v14 through pre in the
  approach pauses, D1b since warm-up. The risk is v14's pre landing in a pause, which makes its O1 cheaper.
- **D2: PASS, about 60 %.** In the Simulator, pass O open-0 cost is at or below v14's, and f1 is lower. Simulator
  composite ms have not predicted phone frame time well before (M6), so this is uncertain.
- **D3: PASS, about 55 %.**
- **Overall: PASS, about 45 %.** OPEN, threshold-sensitive, is the most likely other outcome.
