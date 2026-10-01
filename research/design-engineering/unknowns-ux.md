# Unknowns on the perceived side: what the user feels vs what we measure (de-unknowns-ux)

Design-engineering note by `de-unknowns-ux` (2026-10-01), method and labels as in [`README.md`](README.md). The user
asked the architects and design engineers for the **unknown fields** that could improve our experiments, each with
a next action. Lens: the user's finger feel on the iPhone 15 Pro Max ("SOOOOO ULTRA SMOOTH": steady 60 fps, no
frame over 50 ms) against what our loggers record. Read-only: no Chrome, no iPhone, no locks. All numbers come from
the committed logs in `fixes/iphone-wave2/raw/`, computed offline by
[`unknowns-ux-metric.mjs`](unknowns-ux-metric.mjs) (node, no dependencies).

**Split with the peers.** `de-unknowns-render` owns render-pipeline terms and the mechanism of the y≈1960 and
y≈1250 frames (I rank them only by visibility). `arch-unknowns` owns run validity (heat, Low Power Mode, ProMotion
as a run condition, cache, drift, statistics) and our drivers' coverage gaps; where a gap matters to the user
(slow drags, toolbar), I say why and it states the gap.

Labels: **data** (our logs, file named), **derived** (my arithmetic), **vendor doc**, **literature**,
**inference** (my reasoning, unverified).

## 0. Verdict in six lines

1. **Our frame counts don't track what the user feels; a motion-weighted metric does on all three verdicts we
   have** (§1.3). Frames >20 ms fell 40 % from baseline to aw1-10c, and the user said "the same". MWFI (the frame
   interval weighted by how far things moved in it) fell 9 %. MWFI also ranks the regions as the user does
   (morph > hero > middle), where the worst frame ranks the middle first (n is tiny: 4 finger passes).
2. **The worst frames are where nothing the eye tracks moves.** The middle holds the biggest rAF gaps (S 106 ms at
   y≈1960; finger 115-200 ms). They happen during flings at a median 1500-1700 px/s (≈ 40°/s at 30 cm). The hero's
   long frames come at 600-650 px/s (≈ 19°/s), in runs of up to 1 s during slow drags (derived, §1.4).
3. **The morph is worse than scrolling on every perceptual axis** (driver, cool phone; data §1.2):
   - MWFI 34-43 vs 21-23 ms; HTR 350-520 vs 95-150 ms/s; stutter 6-8 events/s vs 2;
   - the nav edge leaps 67-84 px (p95) beyond a 60 Hz step, against 6-13 px for scroll;
   - under the finger, the panel's MWFI is 78-105 ms, 2-3x the driver's.
4. **The morph's ease-out puts its peak velocity on its slowest frame.** Frame 2 of each tween (the scene
   activation, p50 48 ms) leaps 94 px p50, and frames 2-5 carry **61 %** of all excess displacement (data, §2 U2).
   Starting the clock one frame later would make that frame land at velocity 0.
5. **The top unknown is not a render term.** It is whether a time-driven morph under a held, prevented finger feels
   "laggy" even when smooth (U1): mw-g removed the 92-114 px pin jumps and the user felt no difference.
6. **Cheapest next actions:**
   - one ~6-minute finger batch (§4);
   - a pacing-calibration page (U3);
   - one slow-drag W run (U5);
   - adopt MWFI, STUT/s, RUNmax and JUMP next to the tick counts in the stats lib (handed to `ts-analysis`).

## 1. A perceptual metric from the per-frame logs

### 1.1 Definitions (all over "moving" frames, dx > 0; `node research/design-engineering/unknowns-ux-metric.mjs [--groups]`)

- **Displacement per frame** `dx_i` between rAF frames i-1 and i: |ΔscrollY| for scroll; 739·|Δm| CSS px for the
  morph's panel edge (nav height 52 + 739m, morph-endpage §1.2). The morph logger reads `--morph` one frame late
  (on md-gh2, `1-(1-u)^3` with D = 680 ms fits only with that shift); the script realigns it.
- **MWFI**, motion-weighted frame interval = Σ dx·dt / Σ dx, in ms. A main-thread-drawn element that should track
  the motion lags it by v·MWFI/2 on average. At constant speed it is Σdt²/Σdt, the interval a random moment of
  motion falls into. Floor 16.7 ms (Safari's rAF at 60 Hz); compositor motion at 120 Hz is 8.3.
- **HTR**, hitch-time ratio = Σ (k−2)·8.33 ms / moving s, k = round(dt/8.33) (protocol v2 §3.2): the shape of
  Apple's hitch metric, whose guidance is < 5 ms/s good, 5-10 warning, > 10 critical (vendor doc, recalled from
  Apple's hitches tech talks 10855-10857; verify before quoting). Apple scores presented frames, we score rAF.
- **STUT/s**: runs of consecutive frames with k ≥ 4 (≥ 29.2 ms, at least one 60 Hz frame missed), each run counted
  once, per moving second. **RUNmax** is the longest such run in ms: a sustained low-fps stretch.
- **JUMP**: excess leap = dx·(1 − 16.67/dt), in px. It is how much farther than a 60 Hz step the element jumps
  when the late frame lands. The threshold of 20 px (≈ 3.3 mm, ≈ 0.6° at 30 cm) is an **assumption** until U3
  calibrates it.
- **ODD**: the share of frames at k = 1 or 3, i.e. off the 60 Hz grid ("judder at 60 fps").
- **LGG**: the longest gap per gesture. Gestures are split by ≥ 250 ms without motion.

### 1.2 Values on existing data (median [range] over runs; S = scripted scroll, W = hero window, M = morph driver)

| set | n | MWFI ms | HTR ms/s | STUT/s | RUNmax ms | JUMP p95 / max px | ODD % |
|---|---|---|---|---|---|---|---|
| S baseline, whole pass (goal-B2/B3 + 8 passing controls) | 10 | 23.2 [22.1-24.6] | 147 [129-165] | 2.2 | 235 [106-335] | 13 / 98 | 16 |
| S aw1-10c, whole pass | 3 | 21.0 [20.9-21.0] | 95 [94-95] | 2.0 | 138 | 6 / 97 | 14 |
| S baseline hero / middle / end | 10 | 22.7 / 24.3 / 18.6 | 133 / 170 / 39 | 2.5 / 2.5 / 1.1 | 112 / 235 / 44 | 11 / 15 / 0.4 | 9 / 19 / 6 |
| W hero: aw1-10c / aw1-10e / hero v2 / v2+people-o | 3/6/3/3 | 23.3 / 22.8 / 23.3 / 25.9 | 197 / 161 / 126 / 195 | 4.0 / 4.0 / 3.0 / 5.1 | 94 / 94 / 125 / 102 | 20 / 20 / 17 / 22 (p95) | 11 / 10 / 6 / 4 |
| M f / g / gh / ghb (cool runs) | 3/6/4/3 | 43 / 39 / 36.6 / 33.9 | 517 / 479 / 385 / 351 | 6.1 / 6.9 / 8.0 / 8.0 | 507 / 348 / 194 / 170 | 84/139, 78/111, 69/116, 67/112 | 25 / 28 / 20 / 24 |
| M warm runs (voided by heat) | 12 | 119 [62-171] | 622 | 4.9 | 874 | 106 / 431 | 24 |
| finger A2, B2 passes: hero / middle / end scroll | 4 | 35-49 / 32-58 / 25-55 | 211-694 | 2-6 | hero up to 1043 | 7-255 (p95) | 6-34 |
| finger morph panel (E1b, F1, F2, morph log) | 3 | 86 / 78 / 105 | 714 / 725 / 782 | 1.5-2.3 | 668 / 711 / 1435 | 180-240 (p95) | 3-11 |

What the metric adds:
- MWFI orders the morph builds as the p50 did (f > g > gh > ghb), and it separates warm runs from cool ones by 2-4x.
- gh/ghb shortened the freezes (RUNmax 348 → 170-194) but **raised** stutter events (6.9 → 8.0/s): fewer, longer
  stalls became more frequent, shorter ones.
- Hero v2 lowers HTR and ODD in the W window, but MWFI is flat (23.3).

### 1.3 Check against the user's three verdicts (finger data)

| user verdict | frames > 20 ms / worst frame | MWFI | agrees? |
|---|---|---|---|
| A (baseline) vs B (aw1-10c): "laggy, the same" | S: −40 % frames > 20 ms, all ranges disjoint | finger whole pass: A2 39.1/47.0 vs B2 36.0/46.6; S 23.2 → 21.0 (−9 %) | MWFI yes, counts no |
| E (aw1-10c) vs g at the end: "same laggy" | g: 0 pin calls, > 50 ms share 10 → 21-26 % | panel 86 vs 78 / 105 | both yes |
| lag "at the top and at the morph", not the middle | worst frame: middle in 4/4 passes (152, 115, 200, 190 ms) | hero > middle in 3/4 passes (43.7 vs 39.3, 46.4 vs 32.3, 49.4 vs 35.3; A2 pass 2 has only 34/35 frames); morph panel 78-105 | MWFI yes, worst frame no |

This is a candidate, not a validated metric: 4 passes and 3 verdicts, on a warm phone. U3 is the calibration.

### 1.4 Where the eye can follow (derived)

- At 460 ppi and DPR 3, 1 CSS px = 0.166 mm. At 30 cm, 600 px/s ≈ 19°/s and 1600 px/s ≈ 41°/s.
- Smooth pursuit stays accurate up to roughly 30°/s (literature, approximate). Above that, the eye sees a blur and
  not the position steps.
- Finger runs A2/B2, median speed of the moving frames (data):
  - hero 610-650 px/s (v90 1.7-1.9k);
  - middle 1.5-1.7k (v90 3.6k);
  - B2's hero has 11 frames of 55-70 ms at 18-290 px/s within y 578-758 (RUNmax 1043 ms): about 16 fps for ~1 s
    while the finger drags slowly. That is the people-o expand and the 0.72 flip (F-031/F-032, hero.md B/C). No driver scrolls that
    slowly.

## 2. Ranked unknowns

Ranked by expected value: how likely the answer redirects work on the felt places × that work's size / probe cost.
Each item gives the unknown, the evidence, the cheapest probe, the expected value (EV) and the owner.

**U1. Is the end-of-page "laggy" a render problem or an interaction-model problem?**
- *Unknown:* during a push past the end, 90-94 % of touchmoves are prevented, so the page does not follow the
  finger, and the panel runs a 680 ms time tween. Would a perfectly smooth morph under a held finger still feel
  "laggy"?
- *Evidence:*
  - mw-g removed the pin fight (92-114 px alternations, the largest jumps in any log) and the user felt nothing;
  - the finger panel MWFI (78-105) is 2-3x the driver's (34-43) with the same code;
  - the frames are rendering, not JS (F-033).
- *Probe:* fix-nav-morph builds `mw-stub` (perception only, never landed): the panel is replaced by a flat box
  running the same tween. One finger item: push past the end twice on stub vs gh, blind, "laggy or not?" (~1 min).
  The driver confirms the stub's MWFI is ≈ 17.
- *EV:* very high. "Stub laggy" means render fixes (R1-R8) can't satisfy the user, and the route is a finger-driven
  morph (overscroll → m, morph R3/N8) or a design change. "Stub smooth" confirms the render plan. *Owner:* fix-nav-morph (build), lead (finger), de-morph (reading).

**U2. Can the morph hide its setup frame by easing alone?**
- *Evidence* (data, 16 cool driver runs, 96 tweens): the tween frames, in order:

  | tween frame | dt p50 / p90 ms | excess jump p50 / p90 px | share of excess px |
  |---|---|---|---|
  | 2 | 48 / 58 | 94 / 117 | 25 % |
  | 3 | 39 | 55 | 13 % |
  | 4 | 38 | 51 | 12 % |
  | 5 | 38 | 42 | 11 % |
  | later | 25 | 2 | — |

  - Frames 2-5 together carry 61 % of the excess px.
  - The ease-out's peak velocity (739·3/680 = 3.26 px/ms) falls on the scene-activation frame (morph R5).
- *Unknown:* is a one-frame later start (the clock t0 = the first frame after the scene is active, so m stays 0 in
  the expensive frame) invisible as latency?
- *Probe:* first, offline replay of the M logs with t0 shifted by one frame (a predicted JUMP p95 and MWFI; extend
  the script). Then one M block vs gh, n=3+3.
- *EV:* high, and a ~3-line change that keeps every frame's pixels (same m sequence, shifted by one frame).
  Combine with R5 (activate the scene on arm). *Owner:* fix-nav-morph; de-morph signs off the latency.
- *Replay (D4, [`morph-clock-replay.md`](morph-clock-replay.md)):* alone, the per-tween max leap goes 94 → 77 px
  and MWFI −1.2 ms (the leap moves onto the next slow frame). With P-017 the two are complementary: 94 → 35-44 px.
  So P10 stacks on gh-cdwc.

**U3. Which metric does the eye follow: drops, judder, stall length or jump size?**
- *Evidence:* the user's verdicts agree with MWFI and not with counts (§1.3). gh and ghb trade stall length for
  stutter frequency. ODD is 13-28 %: "60 fps" runs that alternate 25/8 ms frames.
- *Probe:* a static page in `research/` with no Fastwork code. A box moves at 600 px/s and at 1600 px/s, driven by
  rAF on the main thread, with injected frame patterns:
  - steady 60;
  - one 50 ms gap per 125 ms;
  - steady 30;
  - alternating 25/8 ms;
  - one 100 ms gap per second.

  The user ranks them blind (~2 min) while the rAF log records the patterns. Fit MWFI, STUT/s, RUNmax and JUMP to
  the ranking.
- *EV:* high: it fixes the primary perceptual metric for every later A/B and calibrates the 20 px JUMP threshold. *Owner:* de-unknowns-ux writes the page; iphone-runner shows it; ts-analysis takes the winner into the stats lib.
- *Built (F5):* [`pacing/index.html`](pacing/index.html) (static, no Fastwork code) and the fit
  [`pacing-fit.mjs`](pacing-fit.mjs).
  - **Trials:** the 5 patterns × 2 speeds, plus two eased trials, plus 2 repeats: 14 blind trials, ~2 min. The eased
    trials use the morph's own tween (739 px, 680 ms ease-out) with three 50 ms gaps, either at the start
    (ease-early) or near the end (ease-late).
  - **The design check (`--synthetic`)** shows what each axis can tell apart:
    - At constant speed, MWFI, HTR and fps rank the patterns alike (|ρ| 0.9-1). So the 10 constant-speed trials
      can't single out MWFI.
    - The speed pair separates JUMP, which scales with v, from the time-only metrics.
    - The eased pair separates the motion-weighted metrics from the frame-weighted ones:
      - MWFI 35 vs 17 ms, JUMP p95 81 vs 1 px;
      - HTR, STUT, RUNmax, >34/s and fps are equal within ~30 %.
  - **Results:** `window.__fwPacing`, `localStorage.fwPacing`, and the final screen's text. To score them:
    `node research/design-engineering/pacing-fit.mjs <results.json>` gives Spearman ρ per metric, plus a repeat check.
- *First result (F5-try2, [`pacing-result.md`](pacing-result.md); one tired session):*
  - Frame-rate metrics fit best: fps ρ −0.72, HTR 0.66, MWFI 0.44.
  - The eased pair went *against* MWFI: gaps at peak velocity rated 2, gaps near the slow end rated 4.
  - So MWFI is not promoted. Use HTR/fps plus JUMPmax for isolated hitches; a v2 repeat block comes before the T3+ metrics.

**U4. Are rAF gaps under compositor scroll visible at all, and what does the y≈1960 frame show?**
- *Unknown:* on iOS the page scrolls in the UI process. Only main-thread pixels wait on rAF: JS tweens,
  scroll-linked JS writes, class flips and tiles not yet painted. The y≈1960 frame (`inert` leaving the invisible
  panel, F-044) is the biggest scripted gap, yet the user never named the middle.
- *Probe:*
  - finger item: a slow scroll (~1 screen per 2 s) over y 1700-2300 on aw1-10e, "did anything hitch?" (~30 s);
  - a QuickTime USB movie of one S run, stepped by frame around the frame: blank tiles, a jump, nothing?
    (de-unknowns-render reads the tiles side.)
- *EV:* high. If it is invisible and the region has no non-passive listener (U6), middle R1/apple-math a2 drops
  below the hero and morph items, and phone slots move there. *Owner:* lead (finger), iphone-runner (capture), de-unknowns-render (mechanism).

**U5. What does a slow drag in the hero cost? No driver samples it.**
- *Evidence:*
  - finger hero MWFI is 44-49, against S/W hero 22.7-23.3: 2x;
  - B2's hero has RUNmax 1043 ms at 43-290 px/s, y 578-758;
  - the hero is where the eye tracks (§1.4), and "the top" is one of the user's two complaints;
  - people-o's 0.92 s per-frame layout fires only when the finger is slow (hero.md C).
- *Probe:* a W run with slow steps (`scrollBy` 40 px every 300 ms ≈ 130 px/s) over y 400-900. aw1-10e vs hero v2,
  n=3, no user. Read RUNmax, MWFI and the per-frame y.
- *EV:* high. It may show the "top" lag is a slow-scroll cost that no current A/B sees (people-o P3, hero R4). *Owner:* fix-hero-exit, iphone-runner. arch-unknowns lists it as a driver gap.

**U6. Does a non-passive touch listener turn a long frame into a scroll freeze?**
- *Evidence:*
  - on aw1-10c/aw1-10e the morph IO edge (y≈1830) arms a non-passive `touchmove` and `touchstart` (listener
    timeline in morphlog-E1b);
  - from then to the end, a touchstart waits for the main thread (webkit.md §6, bug 184250);
  - from touch to the first scroll frame (first frame with a touchmove → first frame where scrollY changes),
    unarmed, took 67-71 ms (n = 4, data), and **no armed sample exists**;
  - scripted drivers can't see it (FINDINGS).
- *Probe:* the recorder adds passive `touchstart` timestamps (ts-gesture's gesture tool or `rec.mjs`). Event Timing
  input delay. 3 flicks started in y 2000-4400 on aw1-10e vs e1 (#6 passive arming): a finger item (~1 min), later
  a G block.
- *EV:* medium-high: decides whether #6 must land before the next finger verdict on anything in the lower half. *Owner:* ts-gesture, fix-nav-morph.

**U7. Do 120 Hz scrolling and 60 Hz rAF make main-thread layers judder against the content?**
- *Evidence:*
  - frame gaps are quantized to 8.33 ms, and ODD is 13-28 %;
  - a scroll-linked element written by JS steps every 2 ticks while the content steps every tick: a relative offset
    of v·8.3 ms (5 px at 600 px/s, 13 px at 1600 px/s) even at a perfect 60 fps (derived);
  - hero v2 (a scroll timeline) may run threaded at 120 Hz, which rAF can't credit (protocol v2 L12).
- *Unknown:* is the page content really scrolled at 120 Hz? Does Safari 26.6.1 thread scroll-driven animations?
- *Probe:*
  - arch-webkit reads the source (threaded scroll-driven animations on iOS 26);
  - two 240 fps slow-motion clips from a second camera, hero v2 vs aw1-10e, W hero window (~3 min of the user's
    time), counting distinct copy positions per 120 Hz frame.
- *EV:* medium-high: says whether hero v2's y≈50 gain is larger than rAF shows. That weighs against its +11 ms
  at y≈700. *Owner:* arch-webkit, iphone-runner.

**U8. Toolbar collapse is a per-frame viewport resize. What does it cost and move?**
- *Evidence* (data):
  - innerHeight walks 775 → 790 → 795 → … → 815 over 280-410 ms;
  - 8-15 transitions per pass, so ~150-300 frames per pass (the hero's order of size);
  - moving frames during a transition are slower in 7 of 9 recorded segments: dt p50 24 vs 17 ms (B2 pass 1,
    n = 152), 32 vs 17 (B2 pass 2), 20 vs 17 (E1), 28 vs 17 (F1); +0 in A2 pass 1 and E1 segment 0. The
    collapse often coincides with a fling start, so speed is a confounder.
- *Probe:*
  - a bundle-mapper (haiku) lists every `dvh`/`svh`/innerHeight/`resize` reader;
  - a Chrome short-lane count of layouts/restyles across 7 resize steps 430×775→815 at phone geometry;
  - a G "toolbar" step.
- *EV:* medium: frequent, and every scripted driver misses it. *Owner:* fix-scroll-engine (T9's 120 ms debounced resize), ts-gesture.

**U9. What does "SOOOOO ULTRA SMOOTH" score on this phone with our recorder?**
- *Evidence:*
  - Apple's pages were timed only in Chrome 6x (apple-math §6);
  - on this phone our best scroll MWFI is 21, against a floor of 16.7;
  - we have no reference for "smooth enough" on these metrics.
- *Probe:* with the iPhone lease, the recorder on one Apple product page (the public page that arch-apple studied;
  the lead approves the external navigation), one S run, and a 30 s finger scroll by the user ("is this smooth?").
- *EV:* high for goal-setting, cheap: it turns the user's word into a number (MWFI, HTR, RUNmax) for the target. *Owner:* iphone-runner, arch-apple.

**U10. Which long frames coincide with motion the eye is tracking?**
- *Evidence:* the 0.72 flip's pair (y≈625-745) lands on a visibility step (the card appears fully blurred), where a
  hitch breaks no motion (inference); the y≈50 frame reads as touch-down latency; mid-tween morph frames break
  visible motion.
- *Probe:* offline: tag each k ≥ 5 frame in the W/S/M logs with "visible main-thread motion at this y" from the
  crossing tables in hero.md/middle.md, and weight the census by it. *EV:* medium, no device. *Owner:* de-hero,
  de-middle.

**U11-U13, cheap or low-value, one line each.**
- **U11 fling checkerboarding:** finger flings reach 5-7.7k px/s (B2 7688 at y 771), ~0.5 Mpx of new tiles per frame
  (8x apple-math §1's 0.065 at 1000 px/s). A main-thread stall then may show blank tiles that no rAF log sees.
  Probe: the U4 capture during the fling-to-top step. EV medium. Owner: de-unknowns-render, iphone-runner.
- **U12 scroll anchoring / layout jumps:** a scan of 6 finger runs for isolated |Δy| ≥ 30 px with still neighbours
  finds only the pin (77-114 px at 5220+) and one unexplained +87 px at y 2408 (F2). Probe: this jump detector plus a
  document-height ResizeObserver in the standard probe (T1a). EV low, cost ~0. Owner: ts-analysis.
- **U13 reload, then scroll within 1 s:** the finger did it (A2 segment 1, 0.3 s after the first frame); no metric
  splits it out. Probe: gesture step 10 with Event Timing. EV low-medium. Owner: ts-gesture (arch-unknowns: gap).

## 3. Y windows ranked by visibility × cost (what to fix first for the felt experience)

| rank | window | what the eye sees move on the main thread | evidence (MWFI / jump / gaps) | visibility |
|---|---|---|---|---|
| 1 | morph push and pin (y ≥ 5220) | the panel edge, at a fixation, under the finger | panel MWFI 78-105 (finger), 34-43 (M); JUMP p95 60-240 px | highest |
| 2 | hero slow drags (y 400-900) | hero exit (JS on aw1-10e), people-o, the nav pill | finger hero MWFI 44-49, RUNmax ≤ 1 s at < 300 px/s | high |
| 3 | first scroll frame (y≈50) | touch-down latency | 43-55 ms, 3/3 (S); hero v2 35 | high (every gesture start from the top) |
| 4 | toolbar transitions (anywhere) | fixed nav and viewport-sized boxes | +3-22 ms p50 in 7/9 segments | medium (frequent) |
| 5 | #people entry (y≈700) | a visibility step plus the start of the blur reveal | 50-63 ms pair | medium |
| 6 | section colour switches (y≈888, 1250, commission end) | a background step | 41-51 ms at y≈1250 | low-medium |
| 7 | y≈1960 morph IO edge | nothing visible (the panel is hidden) unless tiles are blank or touch is blocked | the largest gap (86-114 ms) | low, pending U4/U6 |

## 4. What Apple does, read for perception (apple-math, apple-smooth-scroll)

- **Nothing on Apple's pages tracks the finger through the main thread.** Pinned media is `sticky` (scrolling tree),
  scrubs are video, and per-frame writes are transform/opacity from a cached `scrollY` (AS §2.1-2.4).
- Apple has **no scroll-jack**: a held finger always moves the page (AS §4, nav-morph #6 row).
- Reveals are short, time-based tweens with no blur, played once (AS §2.8). A hitch inside them breaks only a fade.
- Apple prices the state change at a boundary at O(1) (apple-math §0). For perception, the same rule reads: **never
  put the expensive frame where velocity peaks.** Our morph does exactly that (U2).
- Apple's own quality bar for hitches is a time ratio (HTR), not a frame count (vendor doc, §1.1). On that scale our
  scroll sits at 95-165 ms/s and the morph at 350-540.

## 5. The finger batch this note asks for (≈ 6 min of the user's time, one session through the lead)

1. U1: push past the end, stub vs gh, blind, 2 × 2 pushes, "laggy or not?".
2. U4: a slow scroll over y 1700-2300 on aw1-10e, "anything hitch?".
3. U6: 3 flicks started mid-page, aw1-10e vs e1, recorder with touchstart timestamps.
4. U3: the pacing page, ranking of 5 patterns (~2 min).
5. U9: 30 s on the Apple page, "is this smooth?".
6. Optional U7: two 240 fps clips from a second camera.

Every item runs after a passing control (protocol v2 §5.2). The answers are recorded in `fixes/iphone-wave2/` style
with the raw recorder files.
