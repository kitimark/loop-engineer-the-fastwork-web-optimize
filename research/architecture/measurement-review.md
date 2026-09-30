# Measurement review: expected vs measured, per topic (arch-lead, 2026-10-01)

Read-only review of every `results.json` + README (wave 1, wave 2 prototypes), their raw `verify.json` LoAF
attribution, and the **per-frame iPhone logs** in the owners' `out/iphone/*.json` (frames with `scrollY`, which
nobody had broken down by position yet). No Chrome, iPhone or locks used. Scripts: my scratchpad
(`summ.py`: results + LoAF sums per side; `iph2.py`: iPhone long frames per scroll-position cluster).

## 0. Three findings that change how to read every result

1. **"~100 frames >20 ms per run" is mostly host load.** `research/measurement-parallelism/`: the unchanged
   baseline gives ~65 frames >20 ms, ~8-9 >34 ms, ~4 >50 ms at load1 < 6, and ~96-103 / 13-14 / 5-6 at load
   6-15. Every A/B below ran at load1 5-49. Deltas inside one ABBA session are mostly fair (within-session
   r = 0.13), absolute levels are not. The quiet-host target is therefore ~65 → ?, not ~100 → ?.
2. **Every frame >50 ms in Chrome is already explained, and no fix so far targets one.** Summed over each
   A/B's runs, the LoAF list is the same on every baseline: gtag `onscrollend` (1 per run, 62-75 ms, vendor),
   the morph IntersectionObserver callback (JS 13083; 1 per run, 46-58 ms, ~20 ms forced; topic 13), the
   engine `iE` (~2 per run, 60-90 % forced) and future `l` (~2 per run, ~90 % forced), plus commission `a`
   occasionally. That is the ~5 frames >50 ms per run, and why `gt50` is flat in every A/B: only
   `morph-panel-lazy-mount` (not yet measured) removes one of them. The first-party goal is "IO callback + `iE`
   + `l` → 0"; gtag stays (1 per run) unless the goal is restated as first-party.
3. **On the iPhone, the frames >34 ms are fixed *transition* frames, not steady cost.** The scripted scroll
   is deterministic: across 18 good runs (5 topics, base and fix) the long frames land at the same `scrollY`
   every run. Clustered by position (iPhone 430x775, docH 6035; section tops from
   `research/cpu-throttle-calibration/data/iphone/scroll_run1.json`: hero-track 0, people/future 856,
   profile 1122, feed 1600, pain 1408, commission 2958, platform 4155):

   | cluster (scrollY) | frames >34 ms / run, ms / run (baseline) | matches | changed by |
   |---|---|---|---|
   | A 600-760 | 2, ~115 ms (one 55-65 ms at ~740) | hero-track 72 % (y≈616): future card `is-visible` reveal starts (14px blur, 100svh card) (inference) | large-area-blur 118 → 92 ms |
   | B 1230-1260 | 1, ~60 ms | unknown (viewport bottom = profile/feed bottom) | large-area-blur 62 → 24 ms (n=3) |
   | C 1360-1430 | 1, ~36 ms | **commission section activates** (engine IO: top ≤ y + 2 vh ⇒ y≈1408) | none |
   | D 1580-1880 | 5-7, ~245 ms | future/profile shrink writes on phones | **phone-invisible-shrink 243 → 56 ms** |
   | E 1940-2000 | 2, ~165 ms (**the worst frame of every run, 89-119 ms**) | unknown (feed/profile leave the top; pain takes the viewport) | large-area-blur 162 → 105 ms (n=3) |
   | F 2400-2900 | 2-3, ~100-145 ms | **hero deactivates (y≈2405), platform activates (2605), profile deactivates (2801), future deactivates (2958)** | large-area-blur 116 → 65 ms |
   | G 4560-4600 | 1, ~40 ms | unknown, inside platform | none |
   | other | 1-3 | | |

   So ~10 of the phone's ~14-17 frames >34 ms per run sit on ~8 state flips: section activation/deactivation
   (the engine flips `data-start-selling-scene`, which pauses animations **and sets `will-change: auto
   !important` on the whole subtree**, and `data-start-selling-render`, which toggles `content-visibility:
   auto`), plus class flips on big elements. The steady per-frame cost on the phone is small (the dt histogram
   is dominated by the 16-24 ms bin). This is the biggest thing the N1-N8 list missed: **N9
   `transition-frames`** (section 4).

## 1. Per topic

Validity per `fixes/EXPERIMENTS.md`: load1 ≤ 6 is clean, > 6 provisional, > 10 at start contaminated.
"n=3 disjoint" is only p ≈ 0.05 per metric, and each A/B tests ~14 metrics.

### phone-invisible-shrink (landed)
- (a) Expected: fewer forced layouts and writes on phones in the scroll phase. Measured (n=5, load 8-20):
  fps +5.1 "better", gt20 -22 (noise), forced 94 → 31 ms; iPhone gt20 60-64 → 40-43, gt34 14-22 → 10-13
  (disjoint).
- (b) Mechanism gone: yes. The iPhone cluster D (1580-1880) drops 5.7 → 1.3 frames/run, 243 → 56 ms. That
  is the cleanest mechanism proof in the whole study. The Chrome delta is inflated: two baseline runs at
  132/133 frames >20 ms (p95 33 ms) are load spikes, and the fps "better" rides on the same two runs.
- (c) Not measured: nothing important.
- (d) Nothing to add. Its follow-up, the `l` `.hero-track` read → IntersectionObserver (T7), is in E4.

### commission-forced-layout
- (a) Expected: `a` leaves the LoAF list, fewer forced layouts. Measured (n=5, load 6-12, loads balanced
  across sides): gt20 -25 **disjoint**, p95 disjoint, forced 83 → 42 (noise).
- (b) Yes: `a` is gone from the LoAF top list, and `iE` forced drops 147 → 64 ms. But future `l` rose 87 →
  112 ms (the cost moved to the next reader, FINDINGS). The iPhone is flat (D 245 → 203 ms).
- (c) Desktop is where its non-gated writes remain; the desktop run was on the P1-bug patch version.
- (d) Nothing more for phones. For desktop, the var scope work (N4).

### countdown-idle-raf
- (a) Expected: idle only; the scroll phase should be flat. Measured scroll phase (n=5, load 9.6-19.5):
  flat, as expected. Right phase not measured: no idle phase before I-002.
- (b) Unknown. The off-screen pause can't show in a scroll A/B, and no LoAF entry is expected (the springs
  run below 50 ms).
- (c) Idle rAF/style-recalc count per second, and layer count (~75 `.face` layers per countdown).
- (d) Re-run with the idle phase on a quiet host (1 slot) together with the prepared `--layers` variant.
  Lazy mount depends on its `__cdActive` working copy (wave1-dry): commit that first.

### large-area-blur
- (a) Expected: Chrome flat (GPU, P5); iPhone fewer repaints. Measured: Chrome final A/B at load **19-49**
  (contaminated, nothing claimable); earlier version at load 4-12 flat; iPhone paint area 53.6-54.7 →
  48.1-49.2 Mpx (disjoint, n=3); iPhone frames flat by totals.
- (b) Yes for paints. And the cluster view shows more than the README claimed: on the iPhone, E 162 → 105 ms,
  F 116 → 65 ms, B 62 → 24 ms, A 118 → 92 ms, while "other" rose 37 → 95 ms. Net gt34 is flat, so this is
  suggestive at n=3, first patch version (with the lang-switch hunk). Worth confirming.
- (c) Layers and GPU time. The leftover `blur(0)` removals are layer changes that paint counts can't show.
- (d) Re-run the iPhone scripted scroll with the final patch, 3+3 ABBA, and read the result per cluster
  (iPhone lease only, no Chrome slot).

### nav-hit-test
- (a) Expected: less per-frame style (two nav-subtree invalidations per frame), so gt20 and fps move but LoAF
  doesn't. Measured (n=5, load 11-17, balanced): gt20 -36, fps +6.2, one patched outlier run (104), so
  "within noise"; LoAF and forced flat, as predicted.
- (b) Plausibly yes (gt20 sum 507 → 365). No counter was recorded, so the subtree restyle count is unproven.
- (c) Style-recalc element counts: the exact metric of this fix.
- (d) Re-measure in the `nav-morph-all` combine (E1) at load ≤ 6.

### morph-scrolljack-passive
- (a) Expected: touch input latency; the scripted scroll can't see it. Chrome A/B table: not filled in (README
  placeholder). CDP touch probe: touchstart ack 31 → 19 ms (disjoint); touchmove ack flat. iPhone scripted
  flat.
- (b) Unknown. The probe method can't show it: `Input.dispatchTouchEvent` resolves after the main-thread
  dispatch, passive or not (owner's own reading).
- (c) Compositor scroll-start latency under touch. Candidates: Chrome's scroll-latency histograms via
  `Browser.getHistograms` after an `Input.synthesizeScrollGesture` with `gestureSourceType: touch` (sub-question
  R1), or the finger test.
- (d) The finger test (queued) is the only verdict. Don't spend Chrome slots on it.

### morph-panel-lazy-mount
- (a) Expected: the IO callback LoAF (1 per run, 46-58 ms, ~20 ms forced; the largest first-party LoAF)
  disappears from the scroll phase. Measured: **nothing yet** (README placeholders).
- (b) -
- (c) The idle phase (the mount moves there) and the load phase.
- (d) **E1.** It is the only fix aimed at a frame >50 ms. It needs `nav-hit-test` and the countdown `active`
  working copy (wave1-dry).

### pain-offscreen-notes
- (a) Expected: forced layout and script down in the pain → commission stretch. Measured (n=5, load 5-13):
  gt34 15 → 10 **disjoint**, fps +6.4 (noise), forced 83 → 59.
- (b) The mechanism is gone (probe: 333 → 0 reads), but the cost moved: `iE` forced 153 → 29 ms, `l` forced
  84 → 136 ms (n 10 → 15). **Load artifact risk:** the patched side ran at lower load (mean ~8.3 vs ~9.9; one
  patched run at 5.1, below the load-6 step), and baseline run 1 had a 901 ms stall (fps 51.5, LoAF 1544 ms).
  So the gt34 verdict is provisional. iPhone runs 2-3 of **both** sides are broken (219-258 frames, 54-72
  frames >34 ms all over the lower page: environmental), so the iPhone evidence is n=1.
- (c) -
- (d) Keep it (it is correct and cheap). Its real payoff comes with E4 (`l`'s read removed), when the
  migrated cost has nowhere left to go.

### scroll-engine
- (a) Expected: fewer forced layouts from the trampolines. Measured (n=3, load 6.7-11.7): all within noise;
  LoAF +25 "WORSE" (ranges don't overlap at n=3, below the A/A LoAF noise of 60-90 ms): **an artifact**.
- (b) The trampolines are gone (`l` and `a` leave the LoAF list), but `iE` forced rises 98 → 151 ms (n 6 →
  11): the forced cost moved *into* the engine. So the frame still starts with pending style that the first
  measure pays for. Its source is outside the engine: scroll-event handlers, main-thread CSS animations
  updated before rAF, other rAF loops (countdown) that write before the engine runs. Hypothesis tested by E3.
- (c) Toolbar resize debounce: finger only. Scene flips: see cluster F.
- (d) Split it. Keep the parts with a clear mechanism (height-only resize debounce; the carousel IO gate:
  idle; deactivate-final-run). **Park the measure/mutate conversion** until E3 and N1 show the frames are
  script- or forced-bound. Retarget the owner to N9 (the engine owns the scene/render flips).

### hero-exit-scroll-timeline
- (a) Expected: fewer medium frames at the top; LoAF flat (`s` never was a mobile LoAF). Measured (n=3, load
  9-19): fps +5.8, gt20 -24, worst frame -18, all **disjoint**; p95 32.9 → 25.8. The patched side had the
  *higher* load, so this is not a load artifact; but n=3 (p ≈ 0.05 each).
- (b) Yes by design. The baseline side's gt20 median of 115 is high even for its load bin (retro 10-15: 103),
  so the delta may be optimistic.
- (c) iPhone: cluster A sits right after the hero exit (y 600-760). The iPhone A/B is pending; read it per
  cluster.
- (d) Final `--runs 5` on the combined wave-1 base at load ≤ 6 (integrator), plus the iPhone 3+3 by cluster.

### layout-animations (landed)
- (a) Expected: idle layouts down. Own idle probe: 231-330 → 13-16 layouts per 5 s. The scroll A/B is flat,
  as expected. Bottom screenshot 0.56 % (P11 phase shift).
- (b) Yes (probe). (c) The iPhone idle Timeline is still pending. (d) Nothing; confirm in the I-002 idle phase.

## 2. Variants that failed, abandoned or stayed within noise: why

| variant | outcome | idea wrong or measurement blind? | retry? |
|---|---|---|---|
| large-area-blur: remove the nested lang-switch `backdrop-filter` | reverted (EN pill 0.51 % darker) | the idea was visually wrong (P8); cost never measured on the phone GPU | iPhone only, as the N6 design option |
| large-area-blur: `#platform` `filter:none` at rest (6 s idle, iPhone paints) | no paint difference | blind: WebKit composites any filter; the cost is a layer, not paints (P4 is paints only) | iPhone Layers tab count/memory, low priority |
| large-area-blur final Chrome A/B | within noise | blind twice: load 19-49 (contaminated) and GPU cost (P5) | no Chrome retry; iPhone per cluster (E-list) |
| countdown-idle-raf scroll A/B | within noise | wrong phase (idle win, scroll A/B), load 9.6-19.5 | yes: idle phase, quiet host, with `--layers` |
| countdown `--layers` (no `.face` will-change) | prepared, not measured | lock budget | yes, same slot as above |
| nav-hit-test A/B | within noise (-36 gt20, one outlier) | load 11-17; the metric that shows it (style element count) isn't recorded | yes, in E1 at load ≤ 6 |
| morph-scrolljack CDP touchmove ack | flat | blind: the CDP dispatch acks after the main thread regardless | finger test; or histogram probe (R1) |
| morph-scrolljack iPhone scripted | flat | blind: wrong input path (script, not touch) | finger test only |
| scroll-engine measure/mutate | within noise, LoAF "WORSE" | idea half wrong: batching can't remove pending style that comes from outside the engine; the "WORSE" is n=3 noise | park; retry after E3 and N1 |
| scroll-engine tighter engine rootMargin | not applied | owner's judgement (flips would only move closer) | superseded by N9 |
| hero-exit v1 (exit keyframes referencing `--copy-in`) | broke on the iPhone (cue stuck at opacity 0) | idea wrong on Safari (P3) | no |
| pain iPhone runs 2-3 (both sides) | broken runs | measurement: environmental (phone state), both sides | redo pain on the iPhone only if E4 needs it |
| pain gt34 "better" | provisional | load imbalance between sides + a baseline stall run | covered by the wave re-measure |

## 3. Metrics we don't collect but should

1. **Per-frame `[t, dt, scrollY]` in Chrome's `verify.json`.** The iPhone tool keeps it, Chrome's doesn't. With
   it, Chrome A/Bs get the same per-cluster reading that made phone-invisible-shrink's mechanism obvious
   (E5).
2. **Style-recalc and layout counts per phase:** `Performance.getMetrics` (`RecalcStyleCount`, `LayoutCount`
   and their durations), zero overhead. Also `UpdateLayoutTree.elementCount` from a one-off trace (N1).
3. **A state-flip log:** a MutationObserver on class/style/`data-*` attributes plus
   `contentvisibilityautostatechange`, time-stamped with `scrollY`, joined to the frame log. It names the
   cause of each transition frame (E2).
4. **iPhone layers:** Web Inspector Layers count/memory, for the layer diet and the leftover filters.
5. **Touch scroll latency** that is independent of the main-thread dispatch (R1), for the passive-listener
   work.

## 4. Cross-topic: what is still unexplained

- **Chrome >50 ms:** explained (section 0.2). The first-party ones are the IO mount (E1), `iE` and `l` (E3,
  E4).
- **Chrome 34-50 ms:** ~4-8 per run at load > 6 (~4 at load < 6) are **not LoAF-visible and unexplained**.
  Given the iPhone clusters, the likely cause is the same state flips (section activation, class toggles on
  big elements). One experiment explains both devices: **E2**.
- **iPhone >34 ms:** ~10 per run at fixed positions (clusters A, B, C, E, F, G). C and F coincide with engine
  activation thresholds; A, B, E and G are unexplained. E2 names them.
- **New topic N9 `transition-frames`** (owner: the engine owner): make state flips cheap. Candidates, in order:
  1. Drop `will-change: auto !important` from the paused-scene rule and keep only
     `animation-play-state: paused`. A will-change flip destroys and recreates every layer of the subtree in
     one commit.
  2. Un-defer `content-visibility` earlier or in idle time, not at ±1 viewport during the scroll.
  3. Move theme/background class flips from section roots to a small element or an opacity cross-fade.
  4. Add `contain: layout paint` on the section roots.

## 5. Next experiments, ranked by expected gain per lock slot

| # | owner | change | command / slot | expected metric | success criterion |
|---|---|---|---|---|---|
| E1 | fix-nav-morph | combine `nav-hit-test` + `morph-scrolljack-passive` + `morph-panel-lazy-mount` + `countdown-idle-raf` (working copy with `__cdActive`) | `node tools/fix.mjs combine nav-morph-all nav-hit-test morph-scrolljack-passive morph-panel-lazy-mount countdown-idle-raf`, then `node tools/fix.mjs ab nav-morph-all --runs 5` at load1 ≤ 6 (**1 Chrome slot**) | the IO-callback LoAF (1 per run, ~50 ms) is gone: gt50 -1, LoAF ms -50; gt20 down (hit test) | IO callback absent from the top LoAF list in ≥ 4/5 patched runs; gt50 median ≤ baseline - 1; no new errors; `morphReached` 5/5 |
| E2 | fix-scroll-engine (becomes N9) | no page change: a **state-flip probe** (MutationObserver on class/style/`data-*` + `contentvisibilityautostatechange` + `scrollY`), run with the scripted scroll | iPhone: lease, baseline, 3 runs with the probe (**0 Chrome slots**, ~15 min of phone). Chrome: the same probe in one slot with `--runs 3` if the phone is away | names the event behind clusters A-G and the Chrome 34-50 ms frames | ≥ 80 % of frames >34 ms within 2 frames of a named flip; a table flip → frames → ms |
| E3 | fix-scroll-engine | diagnostic overlay, not landable: pause every CSS animation (`.start-selling *, *::before, *::after { animation-play-state: paused !important }`) and force the countdowns' `animate` to false | `node tools/fix.mjs ab anim-ablation --runs 3` (**1 slot**) | if pending animation style is what the first reader pays: `iE` + `l` forced ms -50 % or more, gt20 -15 or more | forced (in LoAF) median and `iE`/`l` forced sums drop by ≥ 40 %. If yes, N3 moves to the top; if not, the pending style comes from scroll handlers or state flips (E2) |
| E4 | fix-nav-morph (owns nav `_`; future `l` is landed code) | T7: replace the `.hero-track` 0.72 rect reads in future `l` and nav `_` with one IntersectionObserver (`rootMargin: -128% 0px 200% 0px`); gate `ee()` with an IO on `#profile-showcase`, reading its static `position`/`top` once | `node tools/fix.mjs ab hero-track-io --on nav-morph-all --runs 5` (**1 slot**, after E1) | `l` leaves the LoAF list (~2 per run, ~90 % forced); forced ms -40; gt50 -1 or more if `iE` doesn't inherit it | `l` absent from the top LoAF list in ≥ 4/5 runs **and** `iE` forced not up by more than half of `l`'s old forced sum (checks the cost-migration trap) |
| E5 | toolsmith (measurement code: logging only) | `verify.mjs`: keep per-frame `[t, dt, scrollY]` per phase and `Performance.getMetrics` deltas per phase (`RecalcStyleCount`, `LayoutCount`, `RecalcStyleDuration`, `LayoutDuration`, `ScriptDuration`) in `verify.json`; add a per-cluster summary script shared with the iPhone logs | incident + `npm test` + `npm run test:chrome` (**0 measurement slots**) | enables the per-cluster reading for every future A/B | `verify.json` carries the arrays; a baseline-vs-baseline A/A shows identical cluster positions |

Next after these: the N9 ablation on the iPhone after E2 (variants: no `will-change` override / no
`content-visibility` deferral / both; 3+3 each, clusters C and F, 0 Chrome slots); the countdown idle +
`--layers` slot; the hero-exit final runs on the combined base (integrator); N3 if E3 says so.

**Drop or park:** the scroll-engine measure/mutate conversion (the cost moves into `iE`); more Chrome A/Bs for
large-area-blur or morph-scrolljack (blind by construction); any verdict at load > 10 (contaminated).

## 6. Wins that look like measurement artifacts

- **scroll-engine "LoAF WORSE"** (n=3, below the A/A LoAF noise; attribution merged into `iE`).
- **phone-invisible-shrink Chrome magnitude** (fps "better", gt20 -22): two load-spike baseline runs carry
  it. The mechanism is real (iPhone cluster D), the Chrome size isn't.
- **pain-offscreen-notes gt34 "better" and fps +6.4:** the patched side ran at lower load, and one baseline
  run stalled for 901 ms. Real mechanism, provisional size, and the cost moved to `l`.
- **hero-exit "better" ×3** is probably real (the patched side had the higher load), but n=3 and an unusually
  bad baseline: confirm before quoting.
- Not artifacts: commission gt20 -25 (balanced loads, `a` gone from LoAF), phone-invisible-shrink on the
  iPhone, large-area-blur iPhone paint area.

## 7. Sub-questions for the specialists (via the lead)

- **W1 (arch-webkit):** On iOS 26, does a `content-visibility: auto` subtree becoming relevant render (style,
  layout, paint, layer creation) synchronously in that frame? Does flipping `will-change: auto !important` on
  a whole subtree destroy and recreate those layers (re-raster) in one commit? Best practice to pre-warm.
- **W2 (arch-webkit):** Is `window.scrollBy({behavior: 'smooth'})` on iOS Safari animated by the UI-process
  scrolling tree (async) or by the main thread? It decides what `iphone.mjs scroll` frame gaps mean.
- **W3 (arch-webkit):** Does a class flip that changes `background` or theme on a full-viewport section root
  repaint every tile of its layer? Would `contain: paint`, or a separate background layer cross-faded with
  opacity, avoid it?
- **R1 (arch-render):** Which Chrome histograms (`Browser.getHistograms`: `Event.Latency.ScrollBegin.Touch.*`,
  `Event.ScrollJank.*`) measure touch scroll latency including blocking listeners? Does
  `Input.synthesizeScrollGesture` with `gestureSourceType: touch` go through the compositor input path and
  respect non-passive listeners?
- **R2 (arch-render):** In Blink, are main-thread CSS animations (and their style invalidation) updated before
  rAF callbacks, so that the first `getBoundingClientRect` in rAF pays for their recalc? This backs E3.
- **R3 (arch-render):** Can `contentvisibilityautostatechange` be used as a probe marker, and what does the
  first render of a skipped subtree cost?
