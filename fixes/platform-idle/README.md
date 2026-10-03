# Fix: platform-idle (G1 glint-ca + G3 sweep-exact)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built; D card P-077 pre-registered (this commit), pre-registered runs not yet made
**Stage:** D (card P-077 sent; lead's signature pending)
**Gate:** less-work landing rule (user T-029 #30, `memory/less-work-landing-rule.md`): fewer work counts on the full page
in Chrome and the Simulator, plus one short phone no-worse check. The pixel-identical rule still applies, and both parts
miss it by a few LSB (see "Pixels"), so the look goes to the user as a proposal (draft below, for the lead to post).
**Driver(s) behind the claims:** none timed. Chrome trace counts (headless, CPU 1x) and Simulator Timeline counts at rest.
**Base:** st6-rb2 (`fix.mjs new platform-idle --on st6-rb2`); `patch.diff` is against the baseline and contains st6-rb2's
changes too.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`: the secure-network component NM (pretty 12447-12520 in the
overlay: activation function and the each-callback). `/_app/immutable/assets/2.gBuqKVzi.css`: G1 block after the
`.start-selling-platform-secure-network-dash-highlight.is-active` rule (overlay 6913-7000) and the reduced-motion
selector; G3 block inside the `prefers-reduced-motion: no-preference` sweep rules (overlay 11293-11345).

## Why it works at rest today (R)

research/gpu-props/README.md §3.3 and §6 (G1, G3), census on st6-rb2 (counts per 2 s, headless 60 Hz, 120 = every frame):
at y 5346 (page bottom, the platform tail) the page should be idle, but runs UpdateLayoutTree 120 / PrePaint 120 /
Paint 240. Ablation: pausing the four sweep titles takes style from 120 to 3-5; pausing SMIL as well takes PrePaint to 9 and
Paint to 0. So the two costs are:

- **G3 sweep** (four titles "doc / earn / secure / organized"): `background-clip: text`, a 300 % gradient, and
  `background-position` animated 100 % → 0 % over 4 s. Blink can't run `background-position` on the compositor, so
  style runs every frame while a title is in view. PMsweepGate (st6-rb2) already pauses titles out of view.
- **G1 glint** (two secure-network dashes): SMIL `<animate>` of the stroke gradient's `x1`/`x2` (5 s, keyTimes
  0/.2/.4/.6/.8/1), started by `beginElement()` 1 s after the dash is ≥ 35 % in view. SMIL changes an attribute, which
  repaints the dash every frame.

## What changed (I)

- **G1.** The `<animate>` pair is no longer mounted. The original if-block stays with an empty render, so hydration walks
  the same markers: SSR renders the block empty too, and `wi` calls `o(-1, null)` exactly as the original does while `v` is
  false (chunks/BSBv9QXB.js 2372-2395).
  - The glint is a span appended to each dash. Appending it imperatively keeps the template and the SSR markup unchanged.
  - The span is clipped by `clip-path: path()` to the original stroke's stadium: line 1.6..92.4, width 3.2, round caps,
    under the viewBox meet transform s = 0.99609375, offset 0.18359375. The layout box is 94 × 3.1875.
  - Inside it, a fixed 0..120 user-unit gradient strip (same 6 stops) slides as a CSS `transform` with the original
    keyTimes, so `x1 = v` becomes `translateX(s·v + 0.18359375 px)`.
  - `.is-active` follows the same `v` signal: 1 s delay after IO ratio ≥ 0.35, off on exit. Reduced motion hides it
    (`opacity: 0 !important`, like the highlight).
- **G3.** Each title keeps its glyphs as a mask (`-webkit-mask-image: linear-gradient(#000,#000); -webkit-mask-clip: text`)
  and drops its own background and animation.
  - A `::after` band, 300 % wide, carries the same gradient and animates `translateX(-66.6667 %) → 0` over 4 s.
  - `[data-sweep-paused]::after` pauses it, so PMsweepGate still works.
  - Everything sits inside the original `prefers-reduced-motion: no-preference` block, so reduced motion is unchanged
    (no band).
- Behaviour kept (lead's ask): the 1 s delay, stop on exit, reduced motion, and PMsweepGate.

## Pixels (illusion rule): not identical, so this goes to the user

Served A/B (st6-rb2 vs this build) frozen frames in Chrome. Animations were paused and set to the same time;
`svg.setCurrentTime` for SMIL. Probe: `out/platform-idle/probe8.mjs`, 9 viewports. Maximum per-channel difference (LSB):

| viewport | m430 DPR3 | m375 DPR3 | m390 DPR3 | m430 DPR2 | t1024 DPR2 | d861 DPR2 | d1000 DPR2 | d1440 DPR2 | d1440 DPR1 |
|---|---|---|---|---|---|---|---|---|---|
| sweep (4 titles × 7 phases) | 9 | 9 | 9 | 9 | 5 | 9 | 16 | 22 | 23 |
| glint (2 dashes × 11 phases) | 56 | 38 | – | 44 | 23 | 42 | 46 | 64 | 43 |
| reduced motion (titles, dash) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 * |

\* d1440 DPR 1: 6933 px of 1-15 LSB, all inside the two avatar photos (image decode), none in the dash band.

- **Sweep.** The text coverage is identical: a white-gradient test gives 0 px of difference. The residual is the
  gradient's phase.
  - Blink snaps the original's background positioning area to device pixels.
  - The composited band moves in about ¼ px steps.
  - Together they leave a sub-device-pixel phase offset that depends on the title's position. In our setup the cause is
    OBSERVED.
  - No CSS-only variant tried was bit-exact: mask-image tiles, snapped offsets, an SVG `<mask>`.
- **Glint.** The interior is within ±1. The difference sits on the anti-aliased top and bottom edge rows, only in the
  visible phases (12 of 22 frames). Frames where the glint is off-stroke differ by ≤ 3, which is the A/A level.
  - The original is a stroked line with round caps.
  - The build is a `clip-path` of the same shape over a filled strip.
  - Blink rasterises the two edges differently. In our setup the cause is OBSERVED.
- All sweep titles are single-line at every width tested (375-1440).
- Simulator (WebKit) frozen frames: sweep ≤ 10, glint ≤ 33 in visible phases, and ≤ 17 on the grey dashes' bottom edge in
  every phase. See "Simulator" below.

### Proposal draft (for the lead to post; the user decides)

Title: "Platform section: glint and colour sweep on the GPU (looks almost the same)".
- What it saves: at the bottom of the page, the platform tail stops making the page redraw at rest.
  - Chrome counts per 2 s (exploratory): style 120 → 8, main frames 120 → 8, paints 240 → 32.
  - Simulator (exploratory): style 238 → 125, layouts 128 → 14, paints 472 → 2.
  - The pre-registered P-077 numbers replace these once they are run.
- What changes on screen (frozen frames, same moment, side by side):
  - the colour sweep inside the four titles sits up to a third of a device pixel off. That is at most 9 of 255 on phones
    and up to 23 on wide desktop.
  - the moving glint on the dashed line has slightly different soft edges, up to 64 of 255 on the top and bottom edge
    pixels only, while the glint passes.
  - On iPhone-like WebKit (Simulator): the sweep is off by at most 10 of 255. The glint edges are off by up to 33 of 255
    while it passes. The grey dashes' bottom edge pixels are off by up to 17 of 255 the whole time the glint is mounted,
    because the dash gets its own GPU layer.
  - Reduced motion is identical.
- Options: A) accept the look-alike (lands under the less-work rule after the phone no-worse check); B) keep the original
  look (topic dropped; the platform tail keeps redrawing every frame at rest); C) G1 only or G3 only (same deal, half the
  saving each, see the census ablation).
- Screenshot pairs to attach (local, not committed): `out/platform-idle/p8/m430-*`, `p8c/d1440-*`, the 4× side-by-side
  crops made by `sideBySide` in `out/platform-idle/lib.mjs`.

## D card P-077 (pre-registered; committed before its data)

**Question.** With the platform tail at rest on the full page, does this build make the page do less main-thread work than
its base (st6-rb2), in Chrome and in the Simulator, per glint cycle and per sweep cycle?

**Gate.** The less-work landing rule (T-029 #30). Counts per event; frame-driven counts are taken from the full page.
No smoothness claim is made.

**Arms and served files** (sha256, first 12 hex, of the JS node and CSS as served; the scorer voids any load whose served
hashes differ). All arms are on the snapshot pinned by `baseline.json` on this branch.

| arm | what | `2.DyWL8TcE.js` | `2.gBuqKVzi.css` |
|---|---|---|---|
| C | st6-rb2 overlay (control) | 7bf7c4657d21 | f523598b2a24 |
| V | platform-idle overlay (build) | de29ff8aa622 | d67d599ab034 |
| B | baseline (context, not judged) | 4606120cf392 | 27776f3d4138 |

**Events.** The animations are continuous, so the event is the animation cycle. Every window is 20 s, which is 5 sweep
cycles (4 s) and 4 glint cycles (5 s), so each window holds whole events of both. Per-event numbers are the window count
divided by 5 (per sweep cycle) or by 4 (per glint cycle). The verdict compares whole windows of equal length, which is the
same comparison.

**Harnesses** (committed here, in `tools/`):
- Chrome, `tools/idlecount.mjs` via `tools/run-chrome.sh`:
  - headless, 430×932, DPR 3, mobile and touch, CPU 1x;
  - stops scrollY 4660 and 5346, settle 3 s, then a 20 s trace window;
  - counts UpdateLayoutTree, PrePaint, Paint, Layout, Layerize, FunctionCall, BeginFrame, DrawFrame.
- Simulator, `tools/simcount.mjs`:
  - functional session, plain http, a new port per load;
  - stops scrollY 4660 and the page bottom, settle 3 s, then a 20 s Timeline window (Page.disable → Page.enable →
    Timeline.start);
  - counts RenderingFrame, RecalculateStyles, Layout, Paint, Composite, FunctionCall, TimerFire, FireAnimationFrame;
  - also reads LayerTree on the platform section: paintCount growth over 5 s, memory, compositing reasons.
- Both record per-stop element checks (running animations in view, glint `.is-active`, SMIL count, titles in view) and
  write the ts-costcard (I-083) pre-cut record shape: `{loads: [{arm, rep, mode: 'full', engine, served, windows: [...]}]}`.
- Scorer: `tools/score.mjs <chrome-records> <sim-records>`, sha256/12 `e86a19940a07`. Harness sha256/12:
  idlecount `f32c668d360b`, simcount `2797612a0347`, run-chrome.sh `24b706e6c2b5`. The scorer was smoke-tested on
  synthetic records only (`out/platform-idle/fake/`).

**Loads and order.** Each engine runs 2 loads per arm, in the order C1 V1 V2 C2. Each engine also gets one B load, for
context only.
- Chrome: hold 1 runs `C:1 V:1 B:1`, hold 2 runs `V:2 C:2`. Both are shared-lane probe holds of at most 300 s.
- Sim: session 1 runs `C:1 V:1`, session 2 runs `V:2 C:2`. Both are shared-lane `simulator` holds.
- Output: `out/platform-idle/pre/chrome.json` and `out/platform-idle/pre/sim.json`. The summary is committed after
  scoring.

**VOID** (per load):
- the load errored, or a window is empty;
- the served hashes differ from the table above;
- V still has an SMIL `<animate>`, or V has a dash in view without both glints `.is-active` and a `pi-glint` animation
  running, or V has titles in view without that many `pi-sweep-band` animations running;
- C has no SMIL, or C has titles in view and no sweep running.

An engine with fewer than 2 valid loads in C or V is VOID. It is re-run with new loads in the same order, and the re-run is
reported.

**Counts.**
- *Judged (must be lower):* Chrome UpdateLayoutTree, PrePaint, Paint; Sim RecalculateStyles, Layout, Paint.
- *Guards (must be no worse):* Chrome Layout, Layerize; Sim RenderingFrame, Composite.
  - In the Simulator, other animations elsewhere on the page keep rendering frames running every frame in both arms
    (exploratory: RF 120 per 2 s in both). The frame count is a full-page, frame-driven count that this fix can't remove,
    so it is a guard, not a judged count (cost card §6.2).
  - A compositor animation keeps compositing, so Composite / DrawFrame stay up by design.
- *Reported only:* FunctionCall, BeginFrame, DrawFrame, TimerFire, FireAnimationFrame.

**Decision rule** (per engine; C min and V max over that engine's valid loads; tol = max(2, ⌈0.1 × C min⌉)):
- *Lower*: V max < C min − tol, for every judged count at the primary stop (Chrome 5346, Sim bottom).
- *No worse*: V max ≤ C min + tol, for every judged and guard count at both stops. At y 4660 other content (agents
  typing) runs on its own loop, so that stop is judged for no-worse only.
- The engine verdict is PASS (lower and no worse), NOT-LOWER (no worse, not lower) or WORSE.
- The rule was set after the exploratory runs below, and is written down here before the pre-registered runs.

**Outcomes:**
- **PASS + PASS:** the less-work gate is met. Next, the lead runs the phone no-worse check (below), and the user decides
  the pixel proposal. The build lands only with the user's option A.
- **Chrome PASS, Sim NOT-LOWER:** WebKit keeps main-thread work, so the card goes back to the lead. The build is no worse
  there and lower in Chrome; the lead and the user choose whether to land on the Chrome saving.
- **Any WORSE, or Chrome NOT-LOWER:** do not land; redesign or drop.
- **VOID:** re-run as above.

**Confidence before the pre-registered data:**
- Chrome PASS: 0.95. The exploratory census below has 120 → 8 per 2 s at the primary stop.
- Sim PASS: 0.85. It was 0.55 before the exploratory Simulator run (two UNRESOLVED WebKit questions, below). That run
  had style 238 → 125, layouts 128 → 14 and paints 472 → 2 per 2 s at the bottom.
  - The remaining risk is load-to-load variation in the agents-typing and accent loops, which can push y 4660's
    guard counts.
- Sim WORSE: 0.05.

**Platform claims** (every one is the engine's, so the fast path does not apply):
- (a) "Blink runs `transform` animations on the compositor with no main-thread style per frame; `background-position`
  can't." CONFIRMED: Chromium `third_party/blink/renderer/core/animation/compositor_animations.cc` (main, read
  2026-10-03), CheckCanStartEffectOnCompositor. Its property switch handles opacity, rotate, scale, translate,
  transform, filter, backdrop-filter, background-color, clip-path and custom properties. Any other property falls to
  DefaultToUnsupportedProperty (`kUnsupportedCSSProperty`), and background-position is not in the list. P-077's Chrome
  counts are the decisive local check either way.
- (b) "WebKit accelerates a `transform` animation on a `::after` under an ancestor with `-webkit-mask-clip: text`", and
  (c) "the same inside a `clip-path` ancestor". UNRESOLVED.
  - The decisive local check is the P-077 Sim counts: RecalculateStyles and Paint at rest with the elements in view.
  - Exploratory LayerTree reasons are in "Simulator" below.
  - A WebKit source read (RenderLayerCompositor) found nothing decisive.
- (d) "SMIL attribute animation repaints every frame in both engines." OBSERVED (census ablation, Chrome). It is not
  needed for the verdict, which compares counts directly.

**Phone no-worse check** (the lead schedules it; this topic makes no phone use):
- driver S (`iphone.mjs scroll`), arms C and V, one run each after one uncounted warm-up per port;
- warm start, battery 38-40 °C; one start method (`iphone.mjs open` the arm's URL, then scroll);
- Low Power Mode runs are dropped.
- No worse means: V's dt > 50 count ≤ C's + 1, and V's bottom fps ≥ C's − 2.

**Which runs are pre-registered.** Only the P-077 runs listed above, made after this commit. Everything else in this
README is exploratory: the comp-census runs, probe8 pixels, and the `simpi` Simulator runs.

## Exploratory counts (not judged)

Chrome comp-census (research/gpu-props/tools/comp-census.mjs, `--idle 2000 --settle 2000 --ablate`), per 2 s.
Columns: UpdateLayoutTree / PrePaint / Paint / Layout / Layerize. a1 = non-compositable CSS animations paused, a2 = SMIL
paused too.

| arm | y | idle | a1 | a2 |
|---|---|---|---|---|
| baseline | 4660 | 120/120/240/0/120 | 120/120/408/48/120 | 81/81/10/3/81 |
| baseline | 5309 (bottom) | 120/120/240/0/120 | 121/121/362/0/121 | 72/72/0/0/72 |
| st6-rb2 | 4660 | 120/120/600/0/120 | 121/121/413/48/121 | 22/22/17/3/22 |
| st6-rb2 | 5346 (bottom) | 120/120/240/0/120 | 5/120/359/0/120 | 4/9/0/0/9 |
| **platform-idle** | 4660 | **15/15/45/0/15** | 76/76/278/48/76 | 25/25/84/3/25 |
| **platform-idle** | 5346 (bottom) | **8/8/32/0/8** | 9/9/36/0/9 | 8/8/33/0/8 |

At y 4660 the a1/a2 windows vary with the agents-typing loop's phase (later windows). The idle column is the comparable one.

## Simulator (exploratory)

`out/platform-idle/simpi.mjs`, one functional session, 2026-10-03 09:13Z.
- Setup: fw-sim 15 Pro Max, iOS 26.5, 430×775 DPR 3. Plain http, a new port per arm.
- Served hashes match the D card table (C 7bf7c4657d21 / f523598b2a24, V de29ff8aa622 / d67d599ab034).

**Timeline counts per 2 s at rest.** RS = RecalculateStyles, L = Layout, P = Paint, C = Composite, RF = RenderingFrame:

| stop | st6-rb2 RS / L / P / C / RF | platform-idle RS / L / P / C / RF |
|---|---|---|
| y 4660 | 231 / 129 / 578 / 116 / 115 | **125 / 18 / 6** / 121 / 121 |
| bottom (y 5260) | 238 / 128 / 472 / 120 / 120 | **125 / 14 / 2** / 121 / 121 |
| dash centred (y 4894) | 232 / 129 / 613 / 117 / 116 | 155 / 48 / 35 / 121 / 122 |
| "Earn" centred (y 4712) | 224 / 133 / 618 / 111 / 111 | 172 / 72 / 68 / 121 / 121 |

- One RecalculateStyles per frame stays in both arms, and rendering frames run every frame.
  - Both arms list running page animations outside the platform tail: morph columns, hero orbit, scroll float, vinyl,
    three-frame. These are full-page frame drivers that this fix does not touch.
  - The tail's own share is about 1 style recalc, 6-7 layouts and 2-4 paints per frame. It goes away.
- LayerTree, platform section, paintCount growth over about 5 s:
  - st6-rb2: `.start-selling-platform-card` repaints 321-354 times, and a stage artboard 106-114.
  - platform-idle: 0 for both. The only repainting layers left are the agents-ask field and list, 30-46 (typing, not this
    topic).
- New layers and their WebKit compositing reasons:
  - each sweep title `::after`: `animation`;
  - the masked "Earn" span: `maskWithCompositedDescendants`;
  - each glint span: `clipsCompositingDescendants`;
  - the glint svg: `animation`;
  - the dash span: `transformWithCompositedDescendants`.
  - All of them have paint growth 0.
- So WebKit runs the band under `-webkit-mask-clip: text`, and the strip under `clip-path`, as accelerated animations
  that don't repaint. This is the decisive local check for claims (b) and (c). They stay UNRESOLVED in the reference sense,
  with this check passed (OBSERVED in our setup until P-077's pre-registered runs repeat it).

**Frozen frames** (Sim, `simctl io screenshot`, marker-calibrated crops, same animation time in both arms):
- Sweep titles: max 5-10 LSB per title, like Chrome. The cause is the same gradient phase.
- Glint, visible phases: max 32-33 LSB.
- Glint, non-visible phases (2 s, 3 s): max 17-18 LSB. Chrome is ≤ 3 there.
  - A full-screen crop of the left dash at 2 s shows where: the diff sits on the bottom anti-aliased row of the grey
    dashes, plus grain on the shield edge, which also changes between frames.
  - A likely cause, OBSERVED in our setup, cause unknown: in WebKit the dash span becomes its own composited layer
    (`transformWithCompositedDescendants`, because of the glint layers inside), and the grey dashes then rasterise at a
    different sub-pixel offset.
  - This is a WebKit-only residual that lasts while the glint is mounted. It goes into the proposal.

## Risks, conflicts, follow-ups

- **fix-scene-scope** (asked 2026-10-03, answered): scene-scope pauses by element selectors on
  `[data-start-selling-scene="paused"]` (st6-rb2 CSS 11861-11892), never by animation name or SMIL, and st6-rb2 has no
  `#platform` entries there. The tail is paused only by PMsweepGate, now through `[data-sweep-paused]::after`, and by the
  glint's `.is-active`; both are kept. Nothing changes there. Its will-change-drop list includes `.start-selling-platform-card`
  (CSS 11908). The glint and band get their layers from their running transform animations, not from the card's
  will-change, and they run only while in view.
- Hydration: the template is unchanged and the glint span is appended after mount. If SSR markup ever changed, the append
  would still be correct.
- The glint gradient ids `secure-network-glint-left/right` are new ids in the document.
