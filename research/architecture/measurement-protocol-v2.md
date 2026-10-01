# Measurement & workflow protocol v2 (arch-lead)

Status: **FINAL DRAFT for approval** (2026-10-01, ~11:15Z). Built from the team inputs (fix-nav-morph,
fix-scroll-engine, fix-hero-exit, mgmt-ops-4), arch-devtools (`research/architecture/devtools-methodology.md`,
3096c8e), de-devtools (`research/design-engineering/devtools-render-metrics.md`, 97b1a41), arch-safari
(`research/architecture/safari-inspector-probing.md`, d3aa186) and de-safari
(`research/design-engineering/safari-render-signals.md`). Open items: §10. Amended ~11:50Z with A1-A9 from
`unknowns-actions.md` §4 (lead's OK): phone segment card and closure on segments (§2.3, §4), axis + decoupling run
(§2.3), per-arm warm-up and battery state (§5.2), dual phone thresholds (§3.2), M-run time profile (§3.3), display
state (§6.3), logger-layout caveat (§5.5; lifted 2026-10-01 for rAF-only loggers, P-023), checklist items 11-12 (§7).
It replaces nothing yet. The lead approves it; then the doc changes in §8 make it binding.

Scope: how we go from "a frame is slow" to a landed fix, and what evidence each step needs, on Chrome, the
iPhone and the finger. Words: **must** = a gate fails without it; **should** = the reviewer asks why not.

## 1. What went wrong today, and the rule that prevents each

| # | lesson (verified source) | v2 rule |
|---|---|---|
| L1 | de-morph's model predicted gh −30-45 ms; the phone measured −6-9 ms. The baseline came from finger runs in a warm phone, the raster rates were ~2x off (morph-endpage §6) | §4: a prediction states a **same-driver** baseline ≤24 h old, passes a closure check, and labels every constant calibrated or assumed |
| L2 | b-noblur "removed the nav blur" but the blur sits on `header.start-selling-top-nav` itself; the ablation measured nothing | D gate: every ablation names element + property and proves it with **computed style in Chrome AND WebKit** before the phone |
| L3 | N10 a-d targeted code that was not the cause (phase-level A/B only). Then the y≈1960 "img src burst" was itself wrong: the R3 logger capped at 12 events per frame. mw10e-src is no winner (ctl 86/92/88 vs src 97/84/91 ms, 21/21 images pre-sourced); with src staged the frame's only event is `inert` leaving the morph panel at the IO edge, 3/3 (F-044) | D gate: attribution needs a positive ablation, negative sibling ablations and a mechanism check. **No capped loggers.** Moving a frame (e2) proves the trigger position, not the cost |
| L4 | /10c shipped the F-030 idle regression; review looked at the idle phase at y=0, the cost was in the post-scroll un-skip | **Idle triple** (y=0, parked mid-page after a scroll, at the pin) in F and V |
| L5 | hero v2 fixed y≈50 and grew y≈700 by ~10 ms; only the phone saw it, 1.5 h later | **Position-bin census diff** on both devices in V: every bin, not only the targeted one |
| L6 | Chrome shows the morph at 110 fps, the phone 15-30 fps. Chrome at 6x throttles only the main thread; WebKit raster, allocation and commit are on the phone's frame path | **Device class** decided at D; phone-only fixes are gated on the phone, Chrome is a no-regression check |
| L7 | Heat voids phone blocks (F-028: idle stays 60 while scroll/bottom fall); cold first runs are slow (F-042); Timeline timestamps are 0 over the proxy; Safari rAF runs at 60 Hz with 1 ms, non-vsync timestamps (§3.2): on-time frames are ≈ 16.7 ms, but longer gaps are not quantized: they spread continuously (no peaks at 33.3 or 50.0 ms in 198k phone gaps, claims-audit §2.3), and 8.33 ms is only a unit there. Low Power Mode halves rAF to 30 Hz | §5 sentinel under load, warm-up run, block limits; §3 tick metrics |
| L8 | Canary drift on the same page: ~92 fps / 25 frames >20 ms (04:25Z, 93b4af2) → 78/57 (08:31Z, 43e40ce) → 75.9/75.2 (10:08Z, acce613), unexplained | §6.3: host-vs-tool A/A, then bisect; until then compare only within one hold |
| L9 | Driver ≠ finger: the morph driver never bounces or pins, the scripted scroll never resizes the toolbar; savings don't add (ghb 21 / gh 24 / g 33) | Claims are scoped to their driver (§5.4); touch paths need G or F before landing |
| L10 | Chrome y and phone y differ by ~77 px; viewports differ (932 vs 775/815) | Positions in **crossing coordinates** (§3.4); Chrome attribution probes at phone geometry |
| L11 | ~6 phone queue reorders in 90 min; owners waited 1 h+ per phone answer | Slot ticket (§2.5): ticketed builds only, ranked queue, reorders at block boundaries |
| L12 | rAF gaps can't credit work moved off the main thread (h2, morph R3, WAAPI strips); every Mpx figure was derived | §3.1 presentation and paint-area sources; predictions state which source can see the gain |
| L13 | On iOS the rAF gap = WebContent + GPU-process raster/flush wait + wait for the next display-link tick + wake latency + post-flush time (not "UI apply", §3.1); **render-server (GPU) time is not on that path** (de-safari, vendor source; refines de-apple F3). A backdrop/filter fix can look smoother with no rAF change, or the reverse | Render-bound is its own device class (§2.3); its gate metric is Instruments render hitches, not rAF |

## 2. Stages and gates

Six stages, each closed by a gate. A topic may skip nothing; a stage can be short.

| stage | question | closes with | signs off |
|---|---|---|---|
| R research | where and how often is it slow? | census card | owner |
| I investigate | what changes in that frame? | event card | owner; mgmt-ops checks it is complete |
| D distinguish | which mechanism and which code cost it, on which device? | **attribution card** | **lead** |
| F fix | does the build do only what we intended? | build card + slot ticket | owner; mgmt-ops validates the ticket |
| V review | is it a win on the target device with no regression elsewhere? | review report (§7) | fix-reviewer |
| L land | — | landing per LEAD.md | lead |

### 2.1 R: census (required evidence)

- **Phone:** ≥3 runs of the relevant driver (S scripted / W window / M morph / G gesture / F finger, §5.4) on the
  exact base, with the standard probe (§5.5). List every frame ≥37.5 ms (k≥5 ticks) with yStart, yEnd and m.
- **Chrome:** `verify --frame-log` (and `tools/frames.mjs`) at 430×932 for gain metrics **and** at the phone's
  geometry (430×775 scripted, 430×815 collapsed toolbar) for position.
- Group by position in crossing coordinates (§3.4). A cluster is **reproducible** if it appears in ≥2/3 runs at
  the same crossing; otherwise it goes on the "rare" list (finger-only, toolbar, load-time) and needs F or G runs
  before any work.
- Output: census card = table of clusters × device × count × median dt × driver, raw files cited.

### 2.2 I: event card

For one cluster: everything that changes in that frame.
- **Crossing table:** every code threshold within ±1 viewport (IO edges, scene gates, scroll-timeline ranges,
  class toggles), with its y on each device (the method of middle.md §2 and F-045's pr4 probe).
- **Per-step probe** across the window (Chrome short lane, counts only): per y step, mutations by type and
  attribute (uncapped), style/layout counts, layer count delta, scene attributes.
- **Phone logger** in the same window: same fields, per frame (§5.5).
- Hypotheses must name **element + selector + property** (or function + line). Each named property is checked by
  computed style in Chrome **and** WebKit (L2).

### 2.3 D: attribution card (the new gate)

A fix is built only on a **NAMED** card. Fields:

1. **Pipeline stage:** script / style / layout / paint recording / raster wait + allocation / "Other"
   (compositing update, layer creation, event-region walks, IO) / tick wait (phone: gap − frame = next-tick wait + wake latency + post-flush; not separable into a 'UI apply' stage, claims-audit P12) / render server (GPU) / input.
   Evidence: Chrome `--trace-frames` class of that frame; on the phone, the RenderingFrame segments of an
   attribution run (§5.5: Script, Layout, Paint+Composite read **together**, Other, and gap − frame) + page-rAF JS
   ms + filter element counts after the frame + LayerTree census (paintCount deltas) bracketing it; for a
   render-server suspect, Instruments Animation Hitches (render hitches, Renders/GPU) over the same cycles.
2. **Code:** the single mechanism and its location.
3. **Ablation set**, all built under new names, all measured in one block against the same control:
   - positive: removing the mechanism removes (or shrinks) the frame;
   - negative: ≥1 sibling ablation in the same frame (another event of the event card) does not;
   - **mechanism check** for each arm: proof that the arm removed exactly the named thing and nothing else
     (computed style, mutation counts, layer count). An arm without it is void (L2).
   - A position-moving ablation (e.g. e2, staging work earlier) proves **where the trigger is**, not what costs:
     it can never be the positive control alone (L3).
   - **Axis + decoupling run (A2):** the card names the axis the frame is locked to (y / crossing, time since a
     named event, or m) and carries one run that moves that axis apart from the others (hold at another y, change a
     hold or transition length, shift a threshold). Scripted drivers make y, time and m collinear; three cards
     picked the co-located event, not the cause (unknowns-actions X3). No decoupling run → at most LOCATED.
4. **Device class:**
   - **Chrome-measurable:** the frame exists in Chrome at 6x in the same crossing → Chrome A/B is the gate,
     the phone confirms.
   - **Phone-only:** absent or flat in Chrome (raster, allocation, GPU, WebKit layerization) → a phone ABBA
     block is the gate; Chrome is a no-regression and parity check. **Before an F build (A1)** a phone-only card
     carries a **phone Timeline segment card** for the frame: Script / Style / Layout / Paint+Composite / Other and
     gap − frame, ≥3 captures, and states which segment the fix removes. A Chrome counter going to 0 proves the
     mechanism ran, not that the phone saves: WebKit pays whole-document style or whole-view layout for changes Blink
     treats as local (window wheel/touch listener add/remove, opacity crossing 1 or filter/transform crossing
     `none`, resized composited layers, `linear()`/`steps()` easings; F-054, unknowns-actions X1).
   - **Render-bound (phone):** the cost is in the render server (backdrop/filter passes): rAF can't score it
     (L13). Gate = render-hitch time per s and Renders/GPU in Instruments, ABBA like §5.3; rAF is a no-regression
     check. Until the Instruments route is verified on this device, such a fix is held at LOCATED.
   - **Touch-only:** depends on touch, bounce, pin or toolbar → G or F runs are required before landing.
5. **Verdict:** NAMED (positive + negative + mechanism all pass), LOCATED (trigger position known, mechanism not
   isolated), UNEXPLAINED. LOCATED may spend one more phone block on ablations; it may not build a fix.

Fast path: a fix whose mechanism is exact and countable in Chrome (T1-type: a removed listener, a deleted
redundant write, counts → 0 by construction) may write a one-line attribution card ("counts X→0, by code") and go
straight to F. The lead decides if a topic qualifies.

### 2.4 F: build card

- Built under a **new name**, served from an immutable snapshot copy, file hashes recorded (`curl -D` on the
  served files, `x-mirror-source: overlay`).
- **Parity:** frozen-frame diff 0 % (P14), plus the backdrop/filter look check (Page.snapshotRect does not render
  `backdrop-filter`, so the user looks; a device framebuffer capture, `idevicescreenshot` or a QuickTime USB recording, should
  include the render-server composite. That is an inference: verify it once against the user's eye, then use it).
- **a11y diff** when `inert`, `visibility`, `aria-*` or focusable content changes.
- **Mechanism delta** in Chrome (bench Tier A, short lane): the named counter moved, nothing else did.
- **Idle triple** (counts: callbacks/s, writes/s, mutations/s, rAF/s) at y=0, parked mid-page after a scroll, and
  at the pin.
- **Memory/layers note:** layer count at 3 fixed positions (Chrome `layerTreeDidChange` against a no-op control;
  `LayerTree.layerPainted` never fires on Chrome M148+, §3.7, so per-layer `paintCount` deltas are the paint source).
- **Prediction card** (§4) written before any timed run.
- Debug hooks (`__fwMorphDrive`, loggers) stripped before landing; a phone build may carry them, the landed
  patch may not.

### 2.5 The slot ticket (phone access)

mgmt-ops-4 validates; the lead orders the queue. A ticket names:
build + hashes; the ONE named control on the same base (and its hashes); driver; the one question; the prediction
id; the "if X then Y" decision for each outcome; the probe set; expected minutes. Rules: only ticketed builds go on
the phone; the queue is ranked by the lead; **reorders only at block boundaries**; an owner whose ticket is
rejected gets the reason in one message. Running blocks are never interrupted for a reorder.

## 3. Metrics

### 3.1 Frame-time sources

| source | device | sees | blind to | role |
|---|---|---|---|---|
| rAF gap (page logger) | both | main-thread frame cadence: scroll-linked JS, style, layout; on iOS also raster/commit back-pressure one frame late (F3) | compositor-presented scroll and threaded animations (can't credit off-main moves); Chrome GPU/raster at 6x | **primary** for both devices |
| `DroppedFrame` ± `hasPartialUpdate` in `--trace-frames` (G1) | Chrome | presented / partial / dropped per phase | iPhone anything; traced runs ≠ untraced | diagnostic; **primary only for threaded-refactor claims** in Chrome |
| WebKit Timeline per-record durations (`Page.enable` before `Timeline.start`) | phone | per-frame style/layout/paint/composite (= WebContent layer commit) ms | GPU/render-server time; medium overhead | diagnostic, attribution runs only |
| WebKit `RenderingFrame` (one per main runloop turn) | phone | segments Script / Layout (style+layout) / Paint (= Paint recording + Composite, which on iOS includes allocation and the **GPU-process raster wait**) / Other (compositing update, layer creation, event regions, IO: no records); the record starts at any main-run-loop wake and ends after the commit's backing-store flush completes (PageTimelineAgent.cpp l.118-135, 361-376; RemoteLayerTreeDrawingArea.mm l.431-440), so it includes the GPU-process flush wait | gap − frame = wait for the next display-link tick + wake latency + post-flush time (not "UI apply"); render server | diagnostic, attribution runs; the per-frame phase breakdown for D and for predictions |
| Instruments Animation Hitches / Metal System Trace | phone | render hitches (render-server CPU/GPU: backdrop, filters), UI-process commit hitches, presented smoothness | page attribution | **primary for render-bound claims**; one-off, own block with its own control |
| Timeline counts per 1 s chunk | phone | paint/layout/style counts and rects | per-frame timing | diagnostic (what exists today) |
| LoAF (`forcedStyleAndLayoutDuration`, scripts) | Chrome | ≥50 ms frames' script attribution, forced layout | WebKit (no LoAF), off-main work | diagnostic |

Never quote "frames >20 ms" as "dropped frames" (arch-devtools §2a).

### 3.2 Tick units (Chrome rAF 120 Hz; phone rAF 60 Hz)

- Tick k = round(dt / 8.333). On-time = k ≤ 2 (one 60 Hz rAF interval).
- Thresholds at tick midpoints: **">34" = dt ≥ 37.5 ms (k≥5)**, **">50" = dt ≥ 54.17 ms (k≥7)** (exact midpoints 4.5 and 6.5 × 8.333; code uses the exact values).
- Report a tick histogram per run; p50 is coarse (moves in 8.33 ms steps), so medians are compared as ticks.
- **Transition:** keep the legacy ms columns (>34, >50 as dt > 34 / > 50) alongside for one wave. Switch the
  primary to ticks after one Chrome A/A and one phone A/A show both; any verdict that differs between the two
  is reported as "threshold-sensitive".
- Dropped ratio with each device's own period (G8) is report-only.
- **The tick model above is Chrome's.** Phone rate: Safari's rAF runs at 60 Hz (WebKit default
  PreferPageRenderingUpdatesNear60FPSEnabled = true: UnifiedWebPreferences.yaml main l.4810-4818,
  safari-7624-branch ~l.6395; AnimationFrameRate.cpp l.35-66; bug 173434; CONFIRMED, claims-audit P9), and the rAF
  timestamp is the WebContent rendering-update start at 1 ms resolution, not a vsync (Document.cpp l.8959, Page.cpp
  l.2424-2428; CONFIRMED, claims-audit P10). Low Power Mode halves rAF to 30 Hz (halfSpeedThrottlingReasons).
- **A5 (phone thresholds).** Safari's rAF stamps mark the start of the rendering update at 1 ms resolution and are not
  vsync-quantized above one vsync (claims-audit §2.3 re-bin: 198 349 gaps, smooth tail 25-75 ms, catch-up gaps
  < 12 ms). The phone verdict therefore uses ms thresholds only:
  - goal: dt > 50 ms (the user's goal), target 0;
  - secondary: dt > 34 ms;
  - sensitivity: also report the counts at the threshold ± 4 ms (dt > 46 / dt > 54; dt > 30 / dt > 38). A verdict
    that differs between the −4 and +4 counts is 'threshold-sensitive'.

  k forms are not used on the phone. Record Low Power Mode per run (rAF halves to 30 Hz). Chrome keeps k≥5 / k≥7
  (BeginFrame stamps are vsync-aligned). (Adopted by the lead 2026-10-01, CLAUDE.md 668b612; replaces the
  provisional dual-form rule and the v≥3 proposal.)

### 3.3 Primary and diagnostic metrics per device and driver

| device / driver | primary | diagnostic |
|---|---|---|
| Chrome A/B (`fix.mjs ab`) | frames >50 and >34 per phase, within ONE hold (>34 varies ±2 across holds) | fps, >20, p50/p95, LoAF, forced ms, cdp counts, trace classes |
| phone S / W | frames dt > 34 and dt > 50 (plus ±4 ms counts, A5) in the topic window and the full pass; topic-window median dt (ms) | fps, phase fps, Timeline counts |
| phone M (morph driver) | moving-m p50 and p95 dt (ms); held m=1 p95; **time-since-tween-start profile** (fwd/rev) and \|Δm\|-weighted dt (A6) | per-m-bin dt (replaced as the profile: the cost tracks time since start, not m), Timeline heavy-paint share (frames with ≥80 Paint records), layer/filter counts |
| phone G / F | frames dt > 50 (plus ±4 ms counts) per pass; morph-active p95; touch input delay (§3.6) | everything above |

Every metric names what it can't see in the README that quotes it. MWFI (motion-weighted frame interval,
Σdx·dt / Σdx; de-unknowns-ux, 3/3 user verdicts) is reported next to the counts as a candidate until the pacing page
(unknowns-actions F5) picks the primary perceptual metric.

### 3.4 Position

- Per frame: yStart, yEnd (scrollY before and after), innerHeight, m.
- **Crossing coordinates:** for each code threshold i, y_i = elementTop_i − f_i·V_i, where V_i is the threshold's
  own base: the frame's innerHeight for IO rootMargins and JS reads; lvh/svh/dvh for CSS vh-based ranges and
  offsets (phone lvh = 815, svh = 775). elementTop_i comes from the same run (layout above it moves). A frame is
  placed by its nearest crossing (Δ = 0 inside [yStart, yEnd], else the signed distance to the nearer end). Chrome and phone are compared by crossing, never by raw y (L10).
- Chrome attribution probes run at the phone geometry; gain A/Bs stay at 932 (the calibrated setting).
- Position bins for the census diff: the topic window, plus fixed bins of 250 px over the whole pass.

### 3.5 Idle

Callbacks/s, writes/s, mutations/s by type, rAF/s, at the **idle triple**. A fix may not raise any of them at any
of the three without a stated reason.

### 3.6 Touch

- Event Timing on the phone (Safari 26.2+): `touchstart` / `pointerdown` input delay (`processingStart −
  startTime`) and duration, `durationThreshold:16` (G2). Measures scroll **start** only (`touchmove` is excluded).
- Per frame: touchmove-carrying frames vs others; `preventDefault` ratio; pin reversals.

### 3.7 Visual parity, paint, layers, memory, CLS

- Parity: frozen-frame diff 0 % (P14); 0-0.4 % in `fix.mjs ab` is phase noise; backdrop by the user's eye.
- **`LayerTree.layerPainted` is unavailable on Chrome M148+.** CONFIRMED (source: Chromium 1bf9d9eb, crbug
  488803411, M148+), empirical check pending (ts-render-signals, Chrome 154 vs 143). Chromium 1bf9d9eb378c "[HiC]
  Allow cc::Layer update rect mutation during paint callback" (main@{#1610086}, 2026-04-04, earliest 148.0.7773.0)
  resets every `cc::Layer` update_rect in `LayerTreeHost::WillCommit` before `client_->WillCommit`;
  `probe::LayerTreePainted` emits only for a non-empty update_rect, so the event worked M94-M147 and is dead from
  M148. (Our probes saw it first: 0 events against 360 `layerTreeDidChange` on a page that repaints every rAF,
  I-032. The earlier guess, "dead since CompositeAfterPaint", is REFUTED.)
- **The paint source is the per-layer `paintCount` delta** between consecutive layer lists (`--paint-rects`,
  `paintRects.source: 'paintCount'`). Its area is **layerMpx**, the full size of the layers that painted, in
  physical px: an **upper bound**, never "paint area" or "clip". Deltas bind to the interval between two lists
  (`binding: 'interval'` when lists are sparser than frames). The probe is opt-in and gets an on/off A/A.
  **Never in timing runs** (gain A/Bs, attribution timings, calibration). OBSERVED (in our setup) in a clean on/off A/A
  (ts-render-signals, 2026-10-01 12:40-12:45Z, baseline, CPU 6x, idle 6, n=3 each interleaved, 0 of 6 host-flagged):
  scroll p50 k=1 in every off run and k=2 in every on run; scroll fps 86.6 → 66.6, gt34 median 5 → 10, morph
  113.5 → 95.6, idle unchanged. Read only its layer counts, churn and per-layer paint counts, in a separate run.
- **Paint rects, when attribution needs them:** the trace snapshot route, categories `devtools.timeline.layers` +
  `blink.invalidation` (`annotated_invalidation_rects`). It is heavy, so it is opt-in and for attribution only, never
  a gain metric. The trace `Paint.clip` is "unreliable and often wrong" per DevTools' own source: never an area
  source (corrects arch-devtools G3a; its Paint *count* is fine). A Chrome area is a lower bound on WebKit's for
  resizing layers, exact for paint-only switches. Phone area: WebKit Timeline `Paint` `data.clip` is usable (the RenderLayer's paint dirty rect, unlike
  Chrome's trace clip): sum per layer (records nest and overlap, never a per-frame union), × 9 for device px;
  event-region paints emit no record, so this is visual paint only. Per 1 s chunk today, per frame in attribution
  runs. Paint ms on iOS is **recording** only; raster shows in the Composite tail (read them together).
- Layers: Chrome count delta via `layerTreeDidChange` vs a no-op control; phone: the LayerTree census of §5.5
  (layer count, per-layer `paintCount` deltas, `memory` estimates, compositing reasons) at fixed positions.
  On WebKit `layerTreeDidChange` is coalesced: a "tree changed" flag, no counts.
- Memory: `JSHeapUsedSize`, `Nodes`, `LayoutObjects`, `JSEventListeners` in `--cdp-metrics` (G7).
- CLS: opt-in Tier A counter (G4), as a parity guard for fixes that move boxes; not a goal metric.

## 4. Predictions and the ledger

Every F-stage build has a **prediction card** before its first timed run:

1. Build + hashes, base + hashes, driver, metric(s).
2. **Baseline:** same driver, same base, same heat class, ≤24 h old; raw file cited. A finger baseline never
   predicts a driver run, and vice versa (L1).
3. **Closure check:** the model reproduces the base's measured value within one tick (or it isn't used). For a
   phone-only class (A1) the closure is done on **phone segments**: the model reproduces Layout and Composite
   separately, within a tick each; a serial sum of code-read terms is not a closure (the phone frame is often a max
   of parallel bounds, and every phone layout is whole-view, 12-17 ms; unknowns-actions X4).
4. **Term breakdown:** which pipeline terms the fix removes, each with its constant labelled *calibrated* (from a
   measured ablation on this device) or *assumed*.
5. **Prediction:** delta with an interval; which metric source can see it (§3.1: a threaded move is invisible to
   rAF gaps, say so).
6. **Falsification reading:** the result that would prove the model wrong.
7. **Decision:** "if within interval → …; if below → …; if worse → …".

Ledger: `fixes/PREDICTIONS.md`, one row per prediction: id, author, date, build vs base, driver, metric,
predicted [interval], measured median [IQR], in interval?, error ratio (measured/predicted), lesson. A model
with **two misses** (outside interval) is reviewed by its author's team before it drives another build.

## 5. iPhone protocol

### 5.1 Builds and serving
Immutable snapshot copies of each overlay (hashes recorded); servers restarted at each block start; plain http
(I-003); Safari tab reloaded per run.

### 5.2 Heat and warm-up
- One **uncounted warm-up run** before the first control of each block (F-042: cold first runs are slow), and
  **one per arm's port** (A3): each origin has its own cold caches and backing stores, so a variant's first run on
  a fresh port is not counted either. Note screen-lock state before the block (P8 sizes the effect).
- **Sentinel under load:** static idle is NOT a heat check (F-028: it stays at 60 while the phone throttles).
  Every control run must reach bottom-phase ≥58 fps and scroll ≥44 fps (S/W); M runs: held m=1 p95 ≤18 ms; W
  runs end with a jump to the bottom and a 3 s hold to give the sentinel.
- A failing control **voids every run since the last passing control**; the block stops, the phone cools
  10 min, and the block restarts.
- **Timeline blocks (lead decision 2026-10-01 12:5xZ).** A block whose counted runs capture Timeline (every counted
  run, every arm, the control included; P3, P11, P14, the listener ticket, and any later one): the sentinel is a
  heat/device-state check whose thresholds were set with Timeline OFF, so it moves to dedicated runs.
  - Order: warm-up(s) → one **uncounted Timeline-OFF control sentinel run** → the counted runs (Timeline on) →
    one **uncounted Timeline-OFF control sentinel run at the block end** → any uncounted attribution runs (e.g.
    P14's st4-rotoff).
  - The two sentinel runs carry the ≥58 fps bottom / ≥44 fps scroll rule (S/W); a failure voids the block as usual.
  - Counted runs are judged within the block only. Each counted C run's fps with Timeline on is recorded as
    information (it measures the Timeline overhead), not as a sentinel.
  - If Timeline-on control data already shows C ≥44 fps scroll, the extra runs shrink to the end sentinel only.
- Heat note in every block record (case off, charger state, room, last block end time), plus **battery
  temperature and charging state per run** (A4: `AppleSmartBattery` Temperature / IsCharging at run start and end,
  T1a+); the heat trend is reported per block and used as a covariate when a block is borderline.

### 5.3 Blocks and n (resolving n≥6 vs ≤9-run blocks)
- A block: ≤9 counted runs, **one question**, one named control on the same base. 10 min cooling between blocks.
- 2 arms: **C V V C C V V C** (4 vs 4). 3 arms: a 3×3 rotated Latin square (C A B / A B C / B C A), n=3 per arm.
- **Sequential decision, max 2 blocks** (a third only by the lead):
  - after block 1 (4v4): **stop, win** if U=0 (exact one-sided p = 1/70 ≈ 0.014) and the Hodges-Lehmann shift ≥
    max(1 tick, half the predicted delta); **stop, futile** if the variant median is worse than the
    control's, or the medians are equal (in ticks) and HL ≤ 0; otherwise run block 2. 3-arm blocks (3v3, minimum
    p = 1/20) can't win in block 1 and always go to block 2 unless futile.
  - block-2 test: exact van Elteren permutation (within-block splits), shift = stratified HL; the aligned 8v8
    (each run minus its block's control median) is reported as a diagnostic.
  - after block 2: pool n=8 per arm **stratified by block** (each run as its difference from its own block's
    control median, or van Elteren). Win if the stratified one-sided p ≤ 0.05 and the shift ≥ 1 tick.
  - 3-arm blocks pooled over 2 blocks give n=6 per arm (hero's n≥6), same stratified rule.
- Report median [IQR] and every run. Never pool frames across runs; never compare across blocks without a shared
  control (heat moves p50 ~5 ms between blocks).

### 5.4 Drivers and scope
| label | driver | covers | never covers |
|---|---|---|---|
| S | `iphone.mjs scroll` (UIKit smooth scrollBy) | scroll-linked main-thread effects | toolbar, touch, bounce |
| W | window run (y window, jump, hold) | one position window, repeatable | touch |
| M | `__fwMorphDrive` | morph m-sweep | touch, bounce, pin |
| G | WDA gesture (ts-gesture), after V0/V1 validation | touch paths, repeatable | real finger variance |
| F | user's finger via the lead | everything, incl. toolbar and bounce | repeatability (≈2x worse than S) |

A claim names its driver. Touch-only classes (§2.3) need G or F before landing; a morph change lands only with G
or F (M never bounces). F runs are scheduled by the lead in batches, not per topic.

### 5.5 Standard probe (one command, every run; arch-safari answers folded)
**In the timed window (page side, cheap):**
- Per frame: [t, dt, yStart, yEnd, innerHeight, m, jsMs].
- Mutations by type and attribute, **uncapped**, per frame (L3).
- Crossing log: every IO edge, scene attribute and class toggle with the frame index.
- After frames k≥5: filter/backdrop **element** counts from page JS (computed style of a fixed selector list).
- `performance.mark()` at every phase edge: WebKit turns it into a Timeline TimeStamp record on the same
  monotonic clock, so page logs and Timeline records join exactly.
- Event Timing touchstart/pointerdown (G/F runs).
- Optional: CPUProfiler + Memory tracking at 500 ms (per-thread CPU, `layers` memory; an early heat warning).

**Outside the timed window only (block start and end, or held positions):**
- LayerTree census: `DOM.getDocument` → `LayerTree.enable` → `layersForNode(root)`: every composited layer with
  `paintCount`, `memory`, `compositedBounds` and compositing reasons. It is a synchronous main-thread walk, so
  never per frame. The `paintCount` delta between two census points = repaints per layer.
- A WebKit screenshot at fixed m for M runs.

**Attribution runs only, for now:** continuous Timeline with real durations. (de-safari would put it in every
block; arch-safari rates its overhead medium and unmeasured. Resolution: it joins the standard block only after
its on/off A/A passes, i.e. no tick-median shift and no extra k≥5 frames; rAF stays the A/B metric either way.) Send `Page.disable`
then `Page.enable` before `Timeline.start`, and again after every reconnect (target ids change on navigation);
`Page.enable` starts WebKit's inspector stopwatch, nothing else does (vendor source; **confirmed on 26.6.1**, F-047: all
1922 records timed, `performance.mark` arrives as TimeStamp, RenderingFrame 16.6-16.7 ms steady). Records are serialised on the main thread, so the overhead is
medium. Read `RenderingFrame` segments per frame (Script, Layout, Paint+Composite, Other) and gap − frame
(= wait for the next display-link tick + wake latency + post-flush time, §3.1; not 'UI apply'). Check Composite's children before reading it as raster: a timer or IO callback that
runs during the flush wait nests under it. A large "Other" = layer churn or event-region walks. A render-server
suspect (backdrop, filters) goes to Instruments Animation Hitches in its own block with its own control.
Timing runs carry only Timeline (Script/Layout/Paint/Composite/RenderingFrame) + the rAF logger; counts and
areas go in separate runs.

**Never during a timed block:** Timeline Screenshot instrument; `Page.setShowPaintRects`, ShowDebugBorders,
ShowRepaintCounter; `layersForNode`; heap snapshots; `Runtime.evaluate` polling faster than ~1 Hz; WDA `/source`
or element queries; xctrace System Trace; Safari's own Web Inspector attached to the tab (a second frontend shares
the agents).

**Logger-layout caveat (A9):** the logger reads `scrollY` in rAF, which on WebKit forces a synchronous layout
whenever y≠0 (R-U1). A read mostly changes *who pays* a layout that is already dirty (40 of 59 whole-view layouts
in the hero captures had no reader at all), but a logger-paid *second* layout in a frame may be ours. Until the P0
y-source A/A picks a source that adds nothing, phone absolute counts and Timeline segment cards carry a
"logger-layout" caveat; A/B deltas between arms with the same logger stay valid. Any new probe gets an on/off A/A
before its numbers are read as absolute.
**Status: lifted 2026-10-01 on P-023 (P0 logger y-source A/A neutral) for loggers that read scrollY once per rAF; not covered: scrollY reads in timer tasks (winrun's per-step timer, ~3.3 Hz) and the pre-T1a std probe's reads in MO/cv crossing callbacks (never used on the phone). Those two read paths keep the caveat until their own on/off A/A; the
rule that any new probe gets an on/off A/A stands.**

**Probe overhead:** page-side probes self-time their callbacks (`performance.now` around each, ms per frame in the
log; a run whose probe ms exceeds 1 ms in a counted frame flags that frame). Protocol-side probes
(Timeline, CPU, Memory) get one interleaved on/off A/A (n=3 each) per probe version.

## 6. Chrome protocol

### 6.1 Stays
`fix.mjs ab`, ABBA n=5, non-overlap verdicts, host gate, 6x, 430×932 DPR 3, `--idle 6`, `--latency 150`, one
hold per A/B, compare within a hold.

### 6.2 Added
- Attribution probes at phone geometry (430×775 / 430×815).
- Per-frame tags for frames >34: scrollY, trace class, top LoAF script / paint source, layer delta.
- Scenarios: idle-after-scroll (park mid-page), `--reload-at <y>`, `--input-at-load`, scroll-up, a measured load
  phase (F-025). Each fix's README lists which scenarios it ran and which it didn't.
- Opt-in `--trace-frames` additions: `DroppedFrame` states (G1), `Layerize`/`UpdateLayerTree`/`Commit` split out
  of `paint` (de-devtools rank 4), `--save-trace` (G6) so the Performance panel can open a run.
- Opt-in `--paint-rects`: per-layer `paintCount` deltas as a layer-size upper bound (§3.7; de-devtools rank 2).
  `LayerTree.layerPainted` is unavailable on M148+ (Chromium 1bf9d9eb, crbug 488803411; CONFIRMED by source,
  empirical check pending). Rects only from the opt-in trace snapshot route (`devtools.timeline.layers` +
  `blink.invalidation`), for attribution. Its own run only: it shifts scroll ticks k=1 → 2 (§3.7), never in a timing run.
- Recalibrate 6x once per wave against the phone (G5), with the same logger on both sides.
- Blind spots stated in every Chrome-only verdict: GPU, raster, WebKit layerization, threaded presentation.

### 6.3 Canary drift (L8)
1. One hold: A/A of the canary page with 93b4af2 tools and with current tools, back to back.
2. Record in the host record: Chrome version, memory pressure, compressor, power source, thermal state; run a
   fixed synthetic CPU page as a host yardstick.
3. Tools differ → bisect 93b4af2..HEAD over the measurement code. Host differs → document the band.
4. Until resolved: compare only within one hold; flag any canary outside the 76-78 fps band.
5. **Display state (A7):** the Mac's display state alone separates the floors (plain baseline 63.5-78.3 fps
   display-on vs 92.2-93.8 DarkWake over 27 holds, no overlap; ddc3450). Every hold records display / wake / power
   (T8+) and keeps it constant (`caffeinate -d -u` or recorded "off"); a canary is checked against display state
   before any tools bisect, and results from different display states never compare.

## 7. Review checklist additions (fix-reviewer)

1. Attribution card is NAMED; each ablation has its mechanism check; no capped logger produced evidence.
2. Device class matches the gate used (phone-only fixes have a phone block; render-bound fixes have hitch data,
   not only rAF; iOS Paint ms read together with Composite).
3. Idle triple counts present, none worse.
4. Position-bin census diff on both devices: no bin worse by ≥1 tick median or +1 frame k≥5 per run.
5. Prediction row exists; measured vs predicted recorded; closure check passed.
6. Claims scoped to drivers; touch-only fixes have G or F.
7. Scenarios not run are listed (idle after scroll, reload while scrolled, early input, scroll up, toolbar,
   rubber band).
8. Phone geometry used for attribution; served hashes match the ticket.
9. Heat notes; sentinel passed; within-block vs the exact base.
10. Backdrop look check, a11y diff, memory/layers note.
11. (A8, X1) Does the fix change a transition or animation end value (to or from `opacity:1`, `filter:none`,
    `transform:none`), a layer's presence, a composited layer's size, an easing to `linear()`/`steps()`, or a
    window/document wheel/touch listener? If yes, a phone segment card (§2.3) backs the claim, not a Chrome counter.
12. (A8, X8, A2) Does the claim's driver cover the class (speed, toolbar, slow drag, scroll-up, start after load,
    touch)? Does the attribution card name its axis and carry a decoupling run?

## 8. Ranked execution plan

### 8.1 Tools (toolsmith-sized, test-first; "MC" = measurement code: call out, `test:chrome`, reviewer)

| rank | item | size | MC? | depends on |
|---|---|---|---|---|
| T1a | `iphone.mjs run --driver scroll\|window\|morph --probe std`: promote out/iphone-runner scripts, per-frame fields, uncapped per-type mutation counts, crossing log | L | device tool (not Chrome A/B) | — |
| T1b | probe add-ons: Event Timing (G2), phase-edge `performance.mark`, probe self-timing, filter counts after long frames, LayerTree census at block start/end, WebKit shot at fixed m, `--timeline` attribution mode (`Page.disable/enable` → `Timeline.start`, RenderingFrame busy time) | M | device | T1a; one on-device check of `Page.enable` first (iphone-runner, 5 min) |
| T3 | analysis lib: ticks, IQR, HL shift, exact MW, stratified block compare, crossing placement; `frames.mjs` reads both devices | S-M | analysis (flag) | — |
| T2 | `iphone.mjs block`: snapshot serve, warm-up, sentinel, order, gaps, auto-void, `block.json` | M-L | device | T1a, T3 |
| T6 | `--trace-frames`: DroppedFrame (G1), layer bucket split, `--save-trace` (G6); per-frame >34 tags | M | yes (opt-in) | — |
| T7 | `verify --paint-rects` (paintCount deltas; `layerPainted` unavailable on M148+, §3.7) + bench `layers` kind | M | yes (opt-in) | — |
| T4 | crossings probe (Chrome short lane, counts) | M | no (bench) | T3 |
| T8 | host record (Chrome version, memory, power, thermal) + canary command | S-M | yes | — |
| T5 | verify scenarios: idle-after-scroll, reload-at, input-at-load, scroll-up, load phase, phone viewport | M-L | yes | T8, canary resolved |
| T9 | CLS counter (G4), CDP memory keys (G7), dropped ratio (G8) | S | opt-in / report | — |
| T10 | Instruments route: verify once that `xcrun xctrace record --template 'Animation Hitches'` attaches to Safari on the phone and that WebKit's signposts decode; then `iphone.mjs hitches --seconds N` wrapping it next to a driver run, exporting hitch ms/s and Renders/GPU per window | S verify + M tool | device | user check first (one-time device pairing in Xcode, through the lead); arch-safari |

Order for the lead: T1a and T3 in parallel now; the T10 check and the T1b `Page.enable` check as two 5-min
phone items in the next slot; then T2; T6+T7 as one "render-side trace signals" incident; T8 before T5. Interim
until T1/T2 land: iphone-runner applies §5 by hand with the 12-event cap removed.

### 8.2 Docs (one doc-owner pass after approval)
- `fixes/LEAD.md`: stages and gates, sign-offs, slot ticket, review additions, canary rule.
- `fixes/README.md` DoD: attribution card, prediction row, phone evidence for phone-only, scenarios list, idle
  triple, driver scope.
- `fixes/AGENT_PROMPT.md`: steps follow R/I/D/F/V.
- `.claude/agents/fix-reviewer.md`: §7.
- `CLAUDE.md`: phone geometry, tick thresholds, iPhone blocks/sentinel/drivers, agent communication (§9).
- `fixes/EXPERIMENTS.md`: fields driver, prediction id, attribution verdict. New `fixes/PREDICTIONS.md`.

### 8.3 In-flight topics onto v2

| topic | state | next step under v2 |
|---|---|---|
| y≈1960 (nav-morph) | LOCATED: `inert` removal at the IO edge (F-044); src rejected. **Update 11:00Z: NAMED** (first v2 D card): the window wheel/touch listener add at the IO edge; positive arm 104/107 → 34/35 ms, negative arm 84/101; P2b RecalculateStyles 34-42 ms + Composite 58-72 ms, JS ~1 ms | no-inert-flip ablation (mw10e-noinert) 4v4 vs aw1-10e with an inert/mutation counter; plus de-safari P2b (one attribution pass, RenderingFrame segments y 1830-1990: Other = event/AX region walk, Script = IO callback, Layout = wide invalidation); record src as rejected in the ledger |
| ghbn | diagnostic | mechanism check: computed `backdrop-filter: none` on `header.start-selling-top-nav` during the morph, Chrome + WebKit. **Two pre-registered predictions** (de-safari P1): de-morph "moving p50 ≤20 ms and the hump flattens" (backdrop on the rAF path) vs de-safari "ghbn within ±2 ms of ghb, hump stays" (render-server term). M block vs ghb, m-bins; record Animation Hitches over the same cycles once T10 works. If rAF is flat and hitches fall, R8 is a render-bound fix (§2.3) |
| morph g/gh/ghb | — | de-safari P2 (RenderingFrame by m bin: where the filter ms live) and P3 (LayerTree paintCount over one gh cycle: do the size-fixed children still repaint?) in one attribution session; P4 recalibrates the raster rate from P2's frames, P5 the first tween frame |
| R8 / R5 (ghr8, ghr85a) | built | wait for ghbn to NAME the backdrop; G/F before landing |
| R2 clip | built | user's look at the next finger batch |
| hero h1/h1v2 | phone-only regression at y≈700 | 2 blocks (n≥6 via 3-arm or sequential), W 0-1000, bins y≈50/700; a11y, memory; de-safari P3b (LayerTree census at y 580/780: is the card pre-rastered?) before a v6/v7 bisect, which runs only if it fails |
| /10d | Chrome-neutral | phone block S + idle-after-scroll + reload-scrolled vs aw1-10e |
| y≈1250 | census 3/3 (base 53-54, aw1-10c 41-46); F-045: commission scene gate paused→active is the candidate | phone logger with `data-start-selling-scene` watched in 1100-1400, then the D card |
| R2 bg | idea | W around y 850-1000 and the commission end, Timeline paints |
| h3 | idea | attribute the 1 Hz idle spike on the device first (de-safari P6: 10 s idle, RenderingFrame + face paintCount; Other = compositing update over ~160 layers → strips) |
| R3 | low | after the morph is NAMED |

### 8.4 Cost
Tools ≈ 23-31 toolsmith hours (T1 6-8, T2 3-4, T3 1-2, T4 2-3, T5 4-6, T6 3-4, T7 2-3, T8 1-2, T9 1,
T10 3).
Phone ≈ 30 min per block, ≈ 1 h per question (2 blocks); the §8.3 list is 10-13 blocks ≈ 5-6.5 phone hours, plus
~1 h of attribution sessions (P2/P2b/P3/P3b/P5/P6, counts and segments, no ABBA), two 5-min tool checks, and one
finger batch plus the one-time Instruments pairing (~30 min of the user's time).

## 9. Agent communication

- The spawn prompt carries a **peer directory** (name or ID per role; F-046 is today's). Role names work only if
  the agent was spawned with a registered name; else use the ID. Never drop a message because a name failed.
- Ask the peer who owns the question directly; the lead lands, resolves incidents, reorders queues, spawns and
  talks to the user.
- Messages arrive only at the recipient's next tool round: **run long waits in the background** (lock queues,
  holds, `incident wait`, phone recordings) so messages reach you mid-wait. Observed tail: up to 26 min when the
  recipient sat in a long foreground command.
- Send peers what they need before you finish; your final report goes only to the lead.

## 10. Inputs and open items

- **arch-safari**: answered Q1-Q5, folded into §3.1, §3.7, §5.5 (`research/architecture/safari-inspector-probing.md`,
  d3aa186). Confirmed on 26.6.1: real Timeline durations after
  `Page.disable`/`Page.enable` (F-047). Still inference: the cost of `layersForNode` on this page's tree.
- **de-safari**: answered Q1-Q4 (`research/design-engineering/safari-render-signals.md`, 8240e5b). Folded: L13, the
  render-bound device class, RenderingFrame segments, the WebKit Paint clip, probes that change what they measure,
  and P1-P6 in §8.3. **Open:**
  - does a framebuffer capture (`idevicescreenshot`, QuickTime over USB) render `backdrop-filter`? Verify once (F);
  - does Instruments decode WebKit's signposts on iOS? (T10);
  - event regions are an unmodelled per-frame term, sized by P2/P2b;
  - Timeline overhead A/A before Timeline joins the standard block (§5.5).
- de-devtools folded (§3.1, §3.7, §6.2, §8.1 T6/T7). arch-devtools folded (G1-G8).
