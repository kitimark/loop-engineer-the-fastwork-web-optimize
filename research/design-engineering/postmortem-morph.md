# Post-mortem: the end-of-page morph refactors on the iPhone (de-pm-morph)

Design-engineering note by `de-pm-morph` (2026-10-01, ~11:00Z). The user asked: our phone-tested rendering refactors
underperformed or failed. **What did we misunderstand, and what is the next action?** Scope: the nav morph at the
end of the page (gh, gb/ghb, ghbn, the mid-tween hump, the first tween frames, the fixed-size diagnostic), and
whether the Apple-style rewrite a1 still ranks first. It builds on [`morph-endpage.md`](morph-endpage.md) §6,
[`apple-math.md`](apple-math.md) §2.5/§4, [`safari-render-signals.md`](safari-render-signals.md) and protocol v2
(`research/architecture/measurement-protocol-v2.md`, §2.3 attribution cards).

**Method.** No phone or Chrome runs, no locks. Offline re-analysis (node) of every morph-driver run of the day:
`md-*.json` (`[t, dt, scrollY, m]` per rAF frame, `__fwMorphDrive({hold: 2000, cycles: 3})`, base aw1-10e) from
`fixes/iphone-wave2/raw/` (to 09:53Z) and iphone-runner's `out/iphone-runner/` (round 2, 10:32-10:36Z). Cool runs
only (held m=1 p95 ≤ 18 ms): g1-5, g7-9; gb1-2; gh1-2, gh4-9; ghb1-3, ghb5-7; ghbn2-4 (warm, excluded: g6, g10, gb3,
gh3, ghb4, ghbn1, f4, f5). New here: frames binned by **time since the tween started** (ts) and direction, not only m.

Labels: **data** (those files), **derived** (my arithmetic), **inference**, **vendor source** (WebKit, as cited in
the notes above).

## 0. Verdict

1. **The "mid-tween hump" is not a function of m. It is a start transient, seen through the ease-out.**
   - Every build, g to ghbn, spends the first ~300-400 ms of each tween at 30-50 ms frames, then settles.
   - The excess over 16.7 ms in that window is 115-127 ms per tween in all six builds (**data**).
   - `1-(1-τ)^3` maps those first frames onto m 0.2-0.6 forward and m 0.6-0.8 reverse: that is the "hump".
2. **After the transient, gh/ghb/ghbn are already on time:** frames ending ≥ 400 ms after the start have p50
   17-19 ms (g: 29).
   - But 73-77 % of the visible motion happens in the first 300 ms.
   - Weighted by motion (|Δm|), the user sees 28-38 ms frames in every build (g 38, gh 33, ghb 28, ghbn 35).
3. **The transient sits inside WebContent, in Composite: the countdown's digit faces repaint (§1b, Timeline).**
   - `gap − RenderingFrame` is ≤ 1 tick in every bin, so it is not outside WebContent (H2 refuted).
   - The slow frames are those that repaint ~80-100 small layers: the 8 countdown digits' `will-change: transform`
     faces inside the morph panel.
   - g repaints them on 67-91 % of moving frames throughout. gh does so on 57-67 % in the first 450 ms and on 11 %
     after.
   - So gh removed this term only in the tail. Its trigger in the first ~450 ms is not yet named.
   - Each heavy frame also costs ~1.5x more in the first 150 ms (Composite−Paint 29-31 vs 20 ms).
   - My first reading, a "parallel bound no ablation touched", was wrong. It is the same term, and gh removes it
     late but not early.
4. **Every morph ablation targeted an m-dependent area term** (panel content, blur radii, the backdrop's area × radius,
   the nav box). The data shows dt depends on time, not on m. That is the shared misunderstanding behind cases 1-5.
5. **The next action is one naming probe, not a fix:**
   - gh with the countdown faces ablated, as a driver pair;
   - P-016 (hold length) for the cold-composite part.

   gh stays as a NAMED tail fix. a1 keeps rank 1 as a direction, but only if it stops the face repaints. It is scored
   on presented frames, not rAF.

## 1. The re-analysis (data)

**Frame dt p50 (ms) by time since the tween started.** fwd / rev; n ≈ 20-90 frames per cell.

| build | 0-100 ms | 100-200 | 200-300 | 300-400 | ≥ 400 | excess ≤ 250 ms per tween | first frame (k=0) fwd / rev |
|---|---|---|---|---|---|---|---|
| g | 39 / 48 | 39 / 39 | 28 / 28 | 30 / 29 | **29 / 29** | 127 ms | 48 / 52 |
| gb | 38 / 47 | 35 / 39 | 28 / 24 | 27 / 25 | 28 / 27 | 111 | 50 / 52 |
| gh | 42 / 44 | 35 / 36 | 30 / 26 | 28 / 26 | **17 / 19** | 120 | 52 / 48 |
| ghb | 35 / 45 | 34 / 28 | 25 / 25 | 30 / 25 | 18 / 18 | 115 | 47 / 50 |
| ghbn | 37 / 45 | 36 / 30 | 25 / 28 | 35 / 29 | 17 / 18 | 118 | 41 / 47 |

**Same m vs same time (gh).** Cells are dir m-bin: median ts → median dt.
- Same m, different time: m 0.6-0.8 is fwd 248 ms → 28 but rev 113 ms → 40; m 0.2-0.4 is fwd 101 → 34 but rev 249 → 25.
- Same time, opposite m: ~50 ms fwd m<0.2 → 47, rev m>0.8 → 47; ~100 ms 34 / 40; ~170 ms 37 / 29; ~250 ms 28 / 25;
  ~500 ms 19 / 20.
- So dt tracks ts within about a tick, whatever the nav size, backdrop area or `#platform` fade. Every other build
  shows the same pattern.

**Tail tick shares** (frames > 250 ms after the start): on time (k ≤ 2) is g 20 %, gh 49 %, ghb 50 %, ghbn 56 %.

Per-run tail p50:
- gh 24/19/21/20/19/25/17/24;
- ghb 19/18/19/22/22/24;
- ghbn 17/20/20.

The medians tie at ~20. Round 1's "ghb 21 vs gh 24" was a one-tick block difference that did not replicate.

## 1b. Timeline read (iphone-runner `mdtl-{g,gh,ghb}-tl1`, `mdtl-ghbn-nav1`, 10:59-11:01Z)

These are attribution runs: one cycle each, hold 2000, Timeline on (not an A/B metric). Each has 40-51 moving
RenderingFrames (RF).

- **Columns:**
  - "heavy" = an RF with ≥ 80 `Paint` records;
  - cp = Composite − Paint (allocation + raster wait) of the heavy (H) or light (L) frames;
  - Σ = Σ(gap − 16.7) per bin.

| build | 0-150 ms: heavy / cp H / cp L / gap−RF / Σ | 150-300 | 300-450 | ≥ 450 |
|---|---|---|---|---|
| g | 83 % / 30 / 13 / 6 / 147 | 89 % / 29 / 14 / 5 / 184 | 91 % / 21 / 10 / 2 / 120 | 67 % / 20 / 8 / 1 / 109 |
| gh | 57 % / 31 / 16 / 7 / 154 | 60 % / 28 / 12 / −4 / 128 | 67 % / 25 / 9 / −1 / 119 | **11 %** / 27 / 8 / 1 / **63** |
| ghb | 83 % / 29 / 12 / 8 / 143 | 58 % / 25 / 8 / −1 / 137 | 54 % / 18 / 11 / 2 / 103 | **10 %** / 27 / 10 / −1 / **51** |
| ghbn | 17 % / 41 / 18 / 5 / 146 | 78 % / 24 / 9 / −5 / 178 | 64 % / 23 / 12 / 3 / 118 | 14 % / 47 / 12 / 2 / 146 |

ghbn's ≥ 450 ms cell rests on two heavy frames (cp 47) in a single cycle. The driver tail (17-18 ms, §1) is the
reference for it. g and ghb have the same heavy clips as gh (the digit cells, at y that move with the center).

**What it shows (data, then derived).**

1. **`gap − RF` is −5 to +8 ms in every bin.** The frame is the WebContent RenderingFrame, so H2 (outside WebContent)
   is refuted on this sample.
   - The first frame (k=0) is the exception: it carries 7-13 ms outside RF (~1 tick), plus "Other" 9 ms
     (6 later) and style 4 ms.
2. **The heavy batch is the countdown.** In gh's heavy frames (`.tl.json` Paint clips), ~80 of the ~96 paints are
   18×37 CSS-px cells at x 53/71, 149/167, 245/263, 341/359 and y 5601/5637/5673, each painted 1-5 times.
   - These are the 8 digits (4 units × 2) of `.waitlist-closing-countdown`, which sits **inside the morph panel**
     (JS 12879, inverse countdown at 13160).
   - Each digit's `.face` is `will-change: transform` (CSS 1408-1415), so each is its own small backing store.
   - The rest are three 139×512 column tiles.
   - Hold frames: 1-2 heavy frames in ~180.
3. **gh's effect is to stop the face repaints after ~450 ms**, not before:
   - heavy share in gh 57-67 % → 11 %; in g it stays 67-91 %;
   - Σ excess at ≥ 450 ms: g 109 → gh 63 / ghb 51. Before that it is equal.
   - This is R1's mechanism check (P3), and it answers case 1. It also replaces the §0 "parallel bound" reading: the
     early frames are bound by the same face-repaint term, and gh's change doesn't stop it early.
   - The early trigger is unnamed. Candidates: per-frame changes of the panel's `scale(0.96 + 0.04m)`, opacity, filter,
     or the center `translate` in gh.
   - Velocity is not the trigger: gh fwd frames at ts 101-126 (|Δm| 0.15-0.21) are light.
4. **The same repaint costs ~1.5x more early:** heavy cp 29-31 ms in the first 150 ms vs 18-25 ms after 300 ms, at an
   equal or larger paint area. Light frames go 12-18 → 8-10 ms.
   - This fits H1 (cold stores after rest). de-unknowns-render cites WebKit source:
     - `RemoteLayerBackingStoreCollection` marks back buffers volatile after 200 ms unused;
     - it also marks front buffers volatile after 1 s, but only for unreachable stores.
   - So a 2 s hold makes every face's back buffer volatile, and the first repaints pay to re-acquire them. This is
     **inference**; P-016 tests it.

## 2. Attribution cards

Form: protocol v2 §2.3, plus the five post-mortem fields the user asked for.

### Case 1: gh (size-stable panel), predicted −30-45 ms, measured −4-10

- **Assumption:**
  - per-frame re-raster of the resized panel content dominates;
  - the baseline is the finger's 58-68 ms;
  - the terms add in series, so removing ~60-75 % of the raster removes ~60-75 % of the excess.
- **Phone data:** moving p50 g 29-35 → gh 24-27. Split by time:
  - tail (≥ 400 ms): g 29 → gh 17-19, −10-11 ms, the frames go on time;
  - transient (≤ 300 ms): g ≈ gh within a tick.
- **What broke:**
  - (i) Measurement, known (§6 of morph-endpage): the finger baseline, ~2x inflated.
  - (ii) Measurement, new: the moving p50 mixes a tail where gh did all R1 promised with a transient where it can do
    nothing.
  - (iii) Model, new: R1 assumed resizing was the only reason the panel children repaint. The Timeline (§1b) shows a
    second trigger. For the first ~450 ms the countdown faces repaint on most frames in gh too, so R1's saving only
    appears after that.
- **Corrected model:** `dt(ts) ≈ base + f_heavy(ts) · C_heavy(ts)` (derived from §1b).
  - f_heavy is the share of frames that repaint the countdown faces:
    - g: ~0.7-0.9 throughout;
    - gh: ~0.6 for the first 450 ms, then ~0.1.
  - C_heavy is the composite cost of that repaint: ~30 ms in the first 150 ms (cold), then ~20-25.
  - R1's term is now **calibrated**: 10-11 ms per tail frame on this phone.
- **Card:** stage Paint + Composite (raster + allocation); code: panel `inset: 0; width/height: 100 %` (CSS
  10543-10554) as the resize trigger of the countdown `.face` repaints. Arms:
  - positive arm gh;
  - negative siblings gb, ghbn (the tail term stays);
  - mechanism check: Timeline heavy share 67 % → 11 % in the tail (§1b; one cycle per build).

  Device class phone-only. **Verdict: NAMED for the tail term.** The ≤ 450 ms term is LOCATED (same layers),
  with its trigger unnamed.
- **Next action:** fix, kept as built.
  - No further R1 tuning: the tail is already on time.
  - It lands only with G or F (protocol v2 §5.4).

### Case 2: gb / ghb (blur removals), small or additive

- **Assumption:**
  - panel, `#platform` and backdrop blur radii cost 2-7 ms per frame;
  - the cost reaches the rAF gap by serial back-pressure (apple-math F3);
  - savings add (ghb ≈ 17-23).
- **Phone data:**
  - tail: gh 17-19 vs ghb 18 (0 ms); g 29 vs gb 27-28 (−1-2 ms);
  - transient: identical;
  - "additive" (round 1: ghb 21 / gh 24) became 26 / 27 in round 2.
- **What broke:**
  - (i) Measurement: a one-tick difference within one block was read as an effect. Block-to-block heat moves medians
    by about a tick (L7, §5.3).
  - (ii) WebKit mechanism (de-safari, vendor source): render-server time is **not** on the rAF path (L13). So rAF can't
    see the blur passes at all, and F3's serial premise doesn't hold.
  - (iii) Our labelling: "b" never removed the nav backdrop (L2).
- **Corrected model:**
  - changing blur radii cost ≤ 1 tick of rAF on this phone;
  - their render-server cost is **unmeasured**, not zero.
- **Card:** stage render server (suspected); code CSS 10545, 5392; no positive rAF arm; device class
  **render-bound**. **Verdict: UNEXPLAINED on rAF; LOCATED needs hitch data.**
- **Next action:** probe, Instruments Animation Hitches g vs ghb over the same driver cycles (T10, once the route is
  verified). No R7 (fixed-radius fades), since it isn't pixel-equivalent and nothing names a gain.

### Case 3: ghbn (nav backdrop off while morphing), ghbn ≈ ghb ≈ gh

- **Assumption (de-morph §6.3):**
  - the hump is the nav backdrop, area × radius = (52 + 739m)·20(1−m), with its peak at m ≈ 0.46;
  - prediction: ghbn ≤ 20 ms and the hump flattens.
  - de-safari pre-registered the opposite: within ±2 ms, hump stays.
- **Phone data:**
  - moving p50 25 / 26 / 27 (ghbn / ghb / gh), p95 52 / 57 / 59;
  - tail 17-18 in all three;
  - transient identical.

  de-safari's prediction held.
- **What broke:**
  - (i) Measurement artifact: the hump was never an m-curve (§1). The area × radius curve was fitted to the m-image of
    a time transient, so a backdrop ablation could not flatten it.
  - (ii) WebKit: the backdrop is render-server work, off the rAF path (L13).
  - (iii) The page's geometry: R8 assumed only a uniform `#f5f5f3` sits behind the nav at m ≥ 0.55. fix-nav-morph's
    Chrome check (`r8-parity.mjs`) shows the backdrop also blurs the end-of-page countdown / "Join waitlist" block:
    the nav half of R8 changes 1.04 / 0.55 / 0.08 % at m 0.55 / 0.7 / 0.9. Only the platform half is exact.
- **Corrected model:** the nav backdrop's rAF cost is ≈ 0 ± 1 tick. Its render cost is unknown.
- **Card:** stage render server; code CSS 11342-11343; arms run, NAVCHECK mechanism check in the session in flight;
  device class render-bound. **Verdict: LOCATED (lead), waits for Instruments.**
- **Next action:** probe, the same hitch block, g vs ghbn. R8 (platform half only, or the nav gated at m ≥ 0.9) is a fix
  only if hitches name the backdrop. It can never be scored on rAF.

### Case 4: the mid-tween hump (m 0.4-0.8 at 29-38 ms) and the first tween frames (49-54 driver, 91-96 warm finger)

- **Assumption:**
  - the hump is an m-dependent backdrop term (case 3);
  - first frames cost the ~88-layer creation at the forward scene flip plus a cold high-quality raster (R5, apple-math rank 4).
- **Phone data:**
  - the hump is the transient (§1);
  - k=0 is symmetric, fwd 41-52 and rev 47-52, in every build;
  - a reverse start creates **no** layers: the scene stays `active` until m < 0.001 (`E = R(() => s(x) > 0.001)`, JS 12947);
  - the scene's flip to `paused` lands on the frame after a reverse tween ends: a restyle of the column subtree,
    `will-change` dropped, animations paused. The first held frame after a tween (both directions pooled) costs
    p50 17-18 ms in gh/ghb/ghbn (p90 23-32), so the
    scene-attribute restyle is cheap at least in that direction;
  - gh removed the cold panel raster, and k=0 did not move;
  - the transient excess is constant (~120 ms per tween) across builds whose tail work differs by ~10 ms per frame.
- **What broke:**
  - (i) Our measurement:
    - binning by m conflated time with state;
    - the frame-weighted p50 under-weights the frames that carry the motion;
    - and a driver artifact is possible: each start follows a 2 s rest, whereas a finger's forward start follows
      scrolling.
  - (ii) The model attributed a symmetric cost to forward-only causes (layer creation, first-resize image quality).
  - (iii) The finger's 91-96 ms adds the touch path and heat (L1); it was never comparable.
- **Corrected model (data + inference, §1b):** the transient is WebContent Composite time, made of two terms.
  - The countdown digit faces inside the panel repaint on most frames for the first ~450 ms in every build. That is
    ~80 small `will-change: transform` stores per frame.
  - Those repaints are ~1.5x dearer in the first 150 ms.
  - The first frame adds ~1 tick outside RF plus "Other" 9 ms.

| hypothesis | mechanism | Timeline outcome (§1b) | status |
|---|---|---|---|
| H1 time since rest | idle stores volatile after the 2 s hold (back buffers at 200 ms, vendor source via de-unknowns-render) | heavy cp 29-31 → 18-25 ms, light 12-18 → 8-10; Layout flat (0.3-0.7 ms) | **supported for the cost per repaint**; P-016 decides |
| H2 outside WebContent | UI apply, render-server coupling | `gap − RF` −5 to +8 ms in every bin; ~7-13 ms on k=0 only | **refuted** except k=0 (≤ 1 tick) |
| H3 start events / per-frame panel changes | a style change that invalidates the faces early but not late: panel `scale`, opacity or filter, the center `translate` (gh), `.is-earn` transitions | heavy share 57-83 % early vs 10-11 % late (gh, ghb), not monotonic in m | **open, leading for the repaint share** |
| H4 velocity | work scaling with \|Δm\| | gh's fastest frames (\|Δm\| 0.15-0.21) are light | disfavoured |

- **Card:** stage Composite (WebContent: allocation + raster wait of the countdown face stores); code: `.face.svelte-1quva9c`
  `will-change: transform` (CSS 1408-1415) under `.waitlist-closing-countdown` in the panel (JS 12879), with the trigger
  unknown. Arms: all five builds are negative arms for the early share. Mechanism check: Timeline paint clips (one
  cycle per build). Device class phone-only. **Verdict: LOCATED (layers and stage); trigger UNEXPLAINED.**
- **Next action:** probes, in order:
  1. **Name the trigger (the cheapest probe):**
     - a gh + countdown-ablated debug pair: the faces `will-change: auto` (one store with the center), or
       `.waitlist-closing-countdown { visibility: hidden }` as the upper bound;
     - run it in the driver, in the same slot as gh, plus one Timeline cycle;
     - if the heavy share and the ≤ 450 ms excess fall, the faces are the term. Then a second Timeline-only build
       toggles the candidate per-frame properties one at a time (scale fixed, filter fixed) to name the trigger.
  2. **P-016** (ticketed): gh, hold 250 vs 2000. A ≥ 1-tick drop at hold 250 makes the cold-store part NAMED (H1).
  3. Only if both are null: a linear-easing debug build.

### Case 5: the fixed-size morph diagnostic (planned by fix-nav-morph, not built)

- **Assumption (fix-nav-morph):**
  - the nav box (backdrop) stays at its final size and radius, and only the panel's clip/opacity/transform animate;
  - `--morph` is still written every frame;
  - prediction: p50 → ~16 ms and the hump flattens if box layout/paint is the term. Otherwise the per-frame style
    writes are.
- **Phone data:**
  - the nav box still resizes, reallocates and repaints during gh's tail (m 0.93-1, ΔH 1-9 CSS px per frame), and the
    tail is 17-19 ms;
  - dt is independent of nav size at a fixed ts (§1).
- **What would break:** both of its candidate terms are constant per frame (box resize grows with m, style writes are
  flat). A constant per-frame term can't make a 300 ms transient unless the same work is slower early.
  - §1b adds a further reason: in gh's tail the nav still resizes, yet the countdown faces mostly don't repaint. So the
    nav resize is not their trigger.
- **Corrected prediction (pre-registered here):**
  - the fixed-size build is within 1 tick of gh on moving p50, on the ≤ 300 ms bins and on motion-weighted dt;
  - a ≥ 1-tick drop in the ≤ 300 ms bins falsifies this note's model.
- **Card:** a negative sibling arm at best.
- **Next action:** don't build it before P-016 and the session report. If it is built, run it as a sibling in the same
  block as the hold probe.

## 3. Does a1 (Apple-style full rewrite) still rank first?

a1 (apple-math §4 rank 1): fixed box + `clip-path: inset(round)` + opacity cross-fade (F-039) + WAAPI with the exact
easing (F-038) + `--morph` `inherits: false`. Its claim was "W_main ≈ 4-5 ms → 16.7-25 ms p50".

- **What the corrected model changes:**
  - The tail is already 17-19 ms on gh, so a1's rAF gain there is ≤ 1 tick.
  - The transient is WebContent Composite work: the countdown faces repainting (§1b). a1 helps there only if its
    fixed box with `clip-path` + opacity stops whatever invalidates the faces. That trigger is unnamed.
  - As a rAF-scored refactor, a1 is no longer predicted to win by itself.
- **What still makes it first:**
  - X is on the WebContent path (H2 refuted).
  - WAAPI transform/opacity run in the render server (vendor source; webkit.md §9). So the visible motion would stop
    waiting for the slow commits.
- **Two caveats:**
  - `clip-path` is not threaded on WebKit, so the pill edge would still step at the slow rate (apple-math §2.5);
  - each face is its own store, so any per-frame invalidation of the panel subtree keeps repainting ~80 stores,
    whichever animation API drives it.
- **Prediction (to be ledgered when built):**
  - rAF moving p50 within 1 tick of gh (the main thread still runs class flips and the clip);
  - Timeline: heavy share ≤ 15 % in the first 450 ms, if a1 removes the trigger;
  - Instruments: presented-frame hitch time over the first 300 ms falls by ≥ 50 % vs gh;
  - gate metric: render hitches and motion-weighted presentation, not rAF (L12, L13).
- **Rank:** first among the larger refactors, **conditional**. The countdown probe (case 4, action 1) ranks above it:
  - it is a one-file debug build;
  - if it names the trigger, a targeted fix may beat a1 at a fraction of the risk (e.g. the faces not composited
    while the panel morphs, or the trigger property moved off the panel subtree).
  - Until then, no fix on the morph is NAMED except gh's tail term.

## 4. What we misunderstood (one line each)

1. **Metric:** we binned by m and took frame-weighted p50s. The cost runs on time since the tween start, and the frames
   that carry 75 % of the motion are the slow ones.
2. **Mechanism:** we assumed resizing was the only thing that repaints the panel children. The Timeline shows the
   countdown's ~80 `will-change` digit-face stores repainting on most frames for the first ~450 ms even in gh. So R1's
   saving shows only in the tail. (My own first reading, a "parallel bound", was also wrong: H2 is refuted.)
3. **WebKit:** rAF can't score blur/backdrop work, because the render server is off its path (L13). The three blur
   ablations were measured with the wrong instrument.
4. **Page geometry:** R8's "uniform backdrop" missed the countdown/waitlist block under the nav. Only the platform half
   of R8 is exact.
5. **Causes:** the first-frame cost is symmetric between forward and reverse, so forward-only causes (scene-flip layer
   creation, first-resize image quality) can't be its main term.
6. **Measurement hygiene:** a one-tick, one-block difference (ghb "additive") was read as an effect. The finger baseline
   was used to predict driver runs (L1).
7. **Driver scope:** every driver start follows a 2 s rest. The first repaints after rest cost ~1.5x more (H1,
   §1b), so the driver may over-state the finger's forward case and still fit its reverse case.
8. **What the panel contains:** the area models counted the panel as images and gradients. Its most expensive
   content per frame is ~80 tiny composited digit faces: a store count, not an area.

## 5. Ranked next actions

| rank | action | type | cost | decides |
|---|---|---|---|---|
| 1 | **Countdown probe**: gh + countdown faces `will-change: auto` (and `visibility: hidden` as the upper bound), a driver pair + one Timeline cycle in one slot | probe | one CSS line per build, ~15 min slot | whether the face repaints are the early term (heavy share, ≤ 450 ms excess) |
| 2 | **P-016**: gh, hold 250 vs 2000 (no new build) | probe | a pair in the same slot | cold-store cost (H1) |
| 3 | Trigger bisection (only if 1 is positive): Timeline-only gh builds with the panel scale / filter / opacity / center translate held fixed, one at a time | probe | 1-2 cycles each | names the trigger, so a fix can be NAMED |
| 4 | Instruments Animation Hitches: g vs ghb vs ghbn, same driver cycles (T10 route first) | probe | one block + the one-time pairing | render-bound class: blur/backdrop cost |
| 5 | gh (R1), kept as the NAMED tail fix | fix | built | lands with G/F per §5.4 |
| 6 | Metric change for M runs (protocol v2 §3.3): a time-since-start profile + motion-weighted dt in place of the m-bin profile; Timeline heavy share as a mechanism column | tool / protocol | small (T3) | stops the m-artifact recurring |
| 7 | Conditional on 1-3: a targeted countdown/trigger fix, else a1 | fix | — | — |
| hold | fixed-size diagnostic, ghr85a (R5a), R7, R8 nav half | — | — | predicted null on rAF (cases 4-5) or not exact (R8 nav, R7) |

## 6. Pre-registrations (for `fixes/PREDICTIONS.md`)

- **P-016** (ticketed by mgmt-ops-4):
  - gh hold 250 vs hold 2000, frames ≤ 300 ms after the start, per direction, in ticks;
  - H1/H2: ≥ 1 tick shorter at hold 250;
  - H3/H4: within 1 tick.
- **Attribution session (gh vs g), frames ≤ 300 ms after the start:**
  - H2 if `gap − RF` ≥ 15 ms; WebContent-bound if RF ≈ gap.
  - **Result: WebContent-bound** (gap − RF −5 to +8 ms; §1b).
- **Countdown probe (action 1)**, gh vs gh + faces `will-change: auto`, frames ≤ 450 ms after the start:
  - if the faces are the early term: heavy share ≤ 20 % and the excess ≥ 30 ms per tween lower (≥ 1 tick on a third of
    the frames);
  - otherwise: within 1 tick.
- **Fixed-size build (if built):** within 1 tick of gh on moving p50, on the ≤ 300 ms bins and on motion-weighted dt.
- **ghr85a:** the forward first frame within 1 tick of gh, and the reverse unchanged.

Scratch scripts (not committed): `an.mjs`, `an2.mjs`, `an3.mjs` in the session scratchpad (`de-pm-morph/`). They read
the `md-*.json` files named above. Tween = a maximal run of frames with 0 < m < 1. Its start time = the first moving
frame's `t − dt`.
