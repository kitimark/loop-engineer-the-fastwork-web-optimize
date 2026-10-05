# Research: end-bg (end-of-page background images, user T-193 #10)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The test overlays contain excerpts of Fastwork's code: they stay local and are never committed.

**Status:** research (no fix). **Stage:** I (attribution): P-137 says CAUSE (§5); next, which part (sub-arm card).
**Owner:** fix-end-bg.
**Question (user T-193 #10/#12):** do the background images in the last screen cause the end-of-page lag, and would an
"optimize it like the hero card" treatment help?
**Driver(s):** Chrome probes (counts only, shared lane), phone G (`iphone.mjs gesture`) for the P-137 block.
**Prediction:** `fixes/PREDICTIONS.md` P-137 (card §3, signed; result §5).
**Base:** C = v9-final + morph-scroll rev 7d (`fix.mjs apply --from morph-scroll-v9try`), JS 1b2eecc66011, CSS e1359ab9994a.

## 1. What is in the last screen (Chrome inventory, OBSERVED)

Probe: `fixes/end-bg/endbg-chrome.mjs --mode inv` (430x775 and 430x815, DPR 3, touch, hover:none/pointer:coarse,
positions pre / m0 / mhalf / m1 of the 7d menu morph), summary `fixes/end-bg/inv-summary.mjs`. Raw file
`out/end-bg/inv-2026-10-05T11-23-24-796Z.json` (local). Geometry at 775: runway t = 775 px, max scroll 5964, #platform
430x1881 sticky (top `calc(100dvh - var(--fw-ms-h))`), menu panel 52 → 402 → 751 px tall from m0 to m1 (791 at 815).

| what (selector) | source | intrinsic | shown at | bytes | decoded (w·h·4) | sizing |
|---|---|---|---|---|---|---|
| menu photo wall (`.start-selling-morph-col img`, CSS l.10973-11021, will-change transform, 16 s drift) | roles/*.png x5 | 1282x1282 | ~138 px wide columns | 325-440 KB each | 6.6 MB each, ~33 MB | %, column flow |
| same wall | post-*, portfolio-*, cover-cafe, work-*, service-*, avatar-cat (16 more, list in §1.1) | 341x512 to 960x540 | same | 84-392 KB | 0.5-3.4 MB each | same |
| agents mesh (`.start-selling-platform-invoice-sheet::before`) | agents/mesh.jpg | 1280x1024 | cover in 640x512, opacity 0.5 | 338 KB | 5.2 MB | px |
| grain overlay (`::after`, stage-grain) | platform/grain.png | 256x256 | tiled at 128 px, mix-blend overlay | 100 KB | 0.26 MB | px |
| stage mesh (`.start-selling-platform-stage.is-mesh-bg`) | radial gradients + grain | n/a | 390x311 | n/a | n/a | px |
| secure network | hex-rings.svg, shield, flags, dash.svg | ≤ 557x615 | as drawn | ≤ 10 KB each | small | px |
| service backdrop (`.start-selling-platform-stage-bg`) | service-bg.avif | 576x1024 | blur(16px), only before the morph | 69 KB | 2.4 MB | % |
| menu veil (`.start-selling-morph-veil`) | radial gradient | n/a | panel size | n/a | n/a | follows the panel |

Large non-image painters in the same screen (blur layers, not backgrounds, out of this ablation's scope): #platform's
`filter: blur(calc((1 - var(--morph-fade)) * 12px))` (CSS l.5698) over 430x1881; the menu panel's `filter: blur(…)`
(l.10957); the header's `backdrop-filter: blur(calc(20px * (1 - var(--morph))))` (l.11792), which is the only painter whose
box changes between 775 and 815 (751 → 791 at m1). Nothing in the last screen uses `background-attachment: fixed`; no
background size depends on vh. T-193 #9 item 4 measured the blur layers (paints -16/-22 % without them).

### 1.1 The menu photo wall in detail (user T-193 #23)

The wall is 5 columns (`c`, JS 13784-13831, each with a `--col-offset` and a list of `[src, height px]`), built by the
templates `cN`/`sN` (JS 13772-13773: `<img loading="eager" decoding="async">`). Its `src` is set only once the menu shows
(`s(b) || s(E)`, JS 14621), and the box height comes from the list (`height: …px`). CSS l.11000-11005: `object-fit:
cover`, `width: 100%`, radius 12 px; the column is 138.1 CSS px wide at 430 px, so 414 device px at DPR 3. The image is a
plain `<img>` without `srcset` (the live site serves the same PNG/JPEG files here, research/image-cost §1). Files measured
on the snapshot with `sips`/`stat`; "x need" = intrinsic ÷ what cover needs at DPR 3 (> 1: larger than any phone screen
shows).

| column | image (under /selling/) | intrinsic | box CSS px | KB | x need | decoded MB |
|---|---|---|---|---|---|---|
| 1 | media/post-1.png | 368x447 | 138x360 | 253 | 0.41 | 0.7 |
| 1 | media/cover-cafe.jpg | 960x539 | 138x212 | 392 | 0.85 | 2.1 |
| 1 | roles/graphic-designer.png | 1282x1282 | 138x349 | 429 | 1.22 | 6.6 |
| 1 | media/service-kitchen.png | 410x512 | 138x167 | 366 | 0.99 | 0.8 |
| 1 | work/work-a.jpg | 736x920 | 138x212 | 126 | 1.45 | 2.7 |
| 2 | media/post-2.png | 368x460 | 138x360 | 222 | 0.43 | 0.7 |
| 2 | profile/portfolio-1.jpg | 960x540 | 138x360 | 275 | 0.50 | 2.1 |
| 2 | media/post-4.jpg | 819x1024 | 138x360 | 145 | 0.95 | 3.4 |
| 2 | roles/architect.png | 1282x1282 | 138x224 | 317 | 1.91 | 6.6 |
| 3 | media/avatar-cat.png | 341x512 | 138x295 | 290 | 0.58 | 0.7 |
| 3 | media/post-3.png | 341x512 | 138x527 | 266 | 0.32 | 0.7 |
| 3 | work/work-c.jpg | 735x893 | 138x394 | 84 | 0.76 | 2.6 |
| 3 | media/service-cafe.png | 480x270 | 138x360 | 290 | 0.25 | 0.5 |
| 4 | roles/software-engineer.png | 1282x1282 | 138x360 | 396 | 1.19 | 6.6 |
| 4 | media/post-5.jpg | 735x893 | 138x443 | 84 | 0.67 | 2.6 |
| 4 | work/work-e.jpg | 736x1042 | 138x221 | 134 | 1.57 | 3.1 |
| 4 | profile/portfolio-2.jpg | 960x540 | 138x525 | 351 | 0.34 | 2.1 |
| 5 | roles/web-developer.png | 1282x1281 | 138x360 | 357 | 1.19 | 6.6 |
| 5 | profile/portfolio-3.jpg | 960x540 | 138x360 | 369 | 0.50 | 2.1 |
| 5 | work/work-f.jpg | 600x848 | 138x417 | 90 | 0.68 | 2.0 |
| 5 | roles/project-manager.png | 1282x1281 | 138x360 | 328 | 1.19 | 6.6 |

- **Only 10 can ever be seen on a phone** (user hint T-193 #25). At `width <= 640px` columns 4 and 5 are `display: none`
  (C's CSS l.11302 media, rule l.11400; baseline l.10888/10986): 8 images, 2.1 MB, still fetched because the `<img>` is
  `loading="eager"`. In the 3 shown columns the column is shifted by `translateY(--col-offset)`, a % of its own height,
  which is the panel height H, and the track drifts ±56 px; the backdrop clips at H. Solving which items ever enter
  [0, H] (H 402 / 751 / 791): work-a, architect and service-cafe never do at H ≤ 791 (architect misses by 8 px). At H 908
  (Chrome's 430x932) 2 of them do, so Chrome at 932 shows 12. This matches the inventory's 10 in view at 775/815.
- 21 images, 5.4 MB on the wire, 61.7 MB decoded at intrinsic size. Only 7 are larger than a DPR 3 screen needs (the 5
  roles PNGs, 1.19-1.91x, and work-a/work-e, 1.45-1.57x); resizing those 7 to their need gives 45.8 MB (-16 MB). 12 are
  already smaller than the need (upscaled on the phone).
- 10 PNGs are photos (222-429 KB); JPEG/WebP/AVIF would cut bytes, not decoded memory.
- The Chrome census (§4) saw no decode in any toolbar-step window: once decoded, the wall costs raster, not decode. The
  earlier WebKit study (research/image-cost §0) found the first-paint decode in WebKit is the only size-dependent cost,
  and that images are not what makes frames slow on this page (Paint 0.25 s against Composite 8 s and Layout 11 s per
  scroll, Simulator, OBSERVED).

## 2. The ablation arm "nobg" and its fairness (Chrome, OBSERVED)

`fixes/end-bg/nobg.css` (sha d566af712894), appended to C's CSS gives V (CSS 38679ce9de15): every background image,
gradient, grain/blend layer and backdrop photo of #platform, the menu morph and the nav stops painting
(`background-image: none`, `mix-blend-mode: normal`, `visibility: hidden` on the photo `img`s). No display, size, position
or animation property changes. A TEST build, not a fix: it changes what you see.

Fairness probe `endbg-chrome.mjs --mode fair --arms C,nobg,C,nobg` (shared slot, 11:26Z; `out/end-bg/fair-…json`):

| | C run 1 | nobg 1 | C run 2 | nobg 2 |
|---|---|---|---|---|
| element boxes (1516, at pre / m0 / m1) | | all equal to C except animated ones | | |
| rAF callbacks / Layout / UpdateLayoutTree (m0 → m1 → m0, 40 steps) | 120 / 84 / 129 | 120 / 84 / 130 | 120 / 84 / 129 | 120 / 84 / 130 |
| elements restyled | 1905 | 1910 | 1905 | 1910 |
| Paint events | 564 | 564 | 564 | 564 |
| RasterTask | 827 | 556 | 804 | 544 |
| JS listeners | 168 | 168 | 168 | 165 |

- Boxes: the only element boxes that differ between C and nobg also differ between two C runs (countdown digit rolls,
  photo-wall drift, 70-84 elements), except one 73x3 box at m1 (x 244 vs 240) which is the secure-network dash glint,
  a 5 s translateX loop (CSS l.7152-7170): animation phase, not layout.
- Script and layout work are the same (rAF, layout, timers, observers); restyles +5 of 1905 (0.3 %). Paint events are
  equal, raster tasks drop by a third: the arm removes paint content only, as intended.
- Chrome's probe injects nobg.css as a `<style>` after load; the phone arm V serves it appended to the CSS file. All rules
  are `!important`, so the cascade result is the same.

## 3. P-137 phone block card (draft for the ops pre-data read)

**Question.** On the real iPhone, in the last screen after the finger lifts, do the background images and grain layers
cause the slow frames the user sees? (User T-193 #10/#12/#17: "remove all background then try to swipe", real-device proof.)

**Arms.** C = v9-final + morph-scroll 7d (JS 1b2eecc66011, CSS e1359ab9994a). V = C + nobg.css (JS 1b2eecc66011, CSS
38679ce9de15). Same base, one change, paint only (section 2). Immutable snapshots: `out/snapshots/endbg-C-e1359ab9994a`,
`out/snapshots/endbg-V-38679ce9de15` (read-only, in fix-end-bg's worktree); the server script copies them into the runner's
`out/p137/snap/{C,V}` and checks the pins.

**Driver, profile, procedure.** G (`iphone.mjs gesture`), script `fixes/morph-scroll/g-fastshort-v1.json` (compiled
program 8737f212c0ff, GESTURE_BUDGET_S 229), E procedure (first touch 4.0-5.5 s after page ready), the same script and
procedure as T-194's E1 on C. Its swipes end at the page bottom. Profile xcode-serious (thermal gate
`thermal-gate.mjs --expect serious --max-c 44 --accept-induced` on the plain baseline server B, at each phone hold's
edges). Plain http, `--vendors=local --latency 150`. Every counted run captures Timeline.

**Block.** One uncounted warm-up per arm port (WC, WV), Timeline-off sentinel S0 on C, 8 counted runs in C V V C C V V C
order (EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4), at most 2 re-runs of runs that fail a run gate, end sentinel S1 on C. 14 fs runs
at most, in 600 s `--no-timing` chrome-measure holds of 2 runs inside two `lock.mjs run iphone --block P-137` holds:

```
part 1: H1 WC,WV | H2 S0,EC1 | H3 EV1,EV2           part 2: H4 EC2,EC3 | H5 EV3,EV4 | H6 EC4 | H7 TAIL (re-runs, then S1)
```

Served JS and CSS of both arms are hashed before every item (a mismatch voids the hold). Sentinel rule and run gates are
the signed P-129 reader rev 1.1's (`research/serious-heat/p129-read.mjs`: S fps ≥ 50 and slow share ≤ 6 %; G1-G6).

**Metric (the same read as T-194).** Per counted run: moving frames in the reader's lastScreen band (scrollY ≥ docH - 2 ×
innerHeight) whose last touch event is a touchend; s(th) = those with dt > th.

**Baseline on C (T-194 E1, one run, read with `p137-read.mjs` on its files):** n 386 frames, >30 24, **>34 19**, >38 12,
>46 6, >50 5, >54 5; class split at >34 (busy) MAIN 4 / RENDER 4 / MIXED 11 (busyRF MAIN 5 / RENDER 0 / MIXED 14); 84 % of
these slow frames sit on a toolbar step (innerHeight changes next to them).

**Decision (>34, per-run counts, ≥ 3 valid runs per arm, both sentinels PASS):**

| verdict | rule |
|---|---|
| CAUSE | max(V) < min(C) and median(V) ≤ 0.5 × median(C) |
| CONTRIBUTES | max(V) < min(C) and median(V) > 0.5 × median(C) |
| WORSE | min(V) > max(C) |
| NOT SHOWN | the ranges touch or overlap |

- Denominator guard: when median n differs between the arms by more than 15 % of C's, the same rule runs on per-run
  rates s/n, and the output says so.
- Twins: the same rule at >30 and >38; any twin with another verdict marks the result "threshold-sensitive".
- >50 (twins >46/>54): reported with the same rule, decides nothing (about 5 frames per run on C: thin).
- Class split (MAIN/RENDER/MIXED, busy and busyRF) and toolbar-step share: descriptive.

**Predictions (before data).**

| # | prediction | p |
|---|---|---|
| 1 | verdict at >34: CAUSE | 0.08 |
| 1 | CONTRIBUTES | 0.30 |
| 1 | NOT SHOWN | 0.57 |
| 1 | WORSE | 0.05 |
| 2 | V's median >34 count is at least 10 (C's T-194 run: 19) | 0.80 |
| 3 | the toolbar-step share of V's slow frames stays ≥ 60 % | 0.80 |

Why: in T-194's C run the slow end frames are mostly MIXED/MAIN and 84 % sit on toolbar steps; RENDER-class frames (the only
ones paint removal can delete outright) are 4 of 19. Chrome's fairness pass shows the arm leaves layout and script alone
and cuts raster by a third. The leading candidates for the rest are the toolbar step itself (the 7d morph's m moves by
about 40/t on every innerHeight change and the whole menu re-renders; #platform's sticky top uses 100dvh) and the blur
layers, neither of which this arm removes.

**Falsification.** CAUSE (or CONTRIBUTES) with the twins agreeing means the user's instinct holds and section 4's
candidates get a fix card. NOT SHOWN means the background images are not where the end-of-page lag comes from on this
device and procedure; the next suspects are named above.

**Kit (runner: iphone-runner; nothing else needed).**

```sh
sh fixes/end-bg/phone/p137-serve.sh start            # copies + checks the snapshots, starts C, V, B (plain http)
TICKET=P-137 P137_DRY=1 sh fixes/end-bg/phone/p137-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2 H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL
TICKET=P-137 node tools/lock.mjs run iphone --owner iphone-runner --block P-137 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p137-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2
TICKET=P-137 node tools/lock.mjs run iphone --owner iphone-runner --block P-137 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p137-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL
node fixes/end-bg/phone/p137-read.mjs out/p137/runs --json out/p137/p137-read.json
sh fixes/end-bg/phone/p137-serve.sh stop
```

Dry run (11:33Z, fix-end-bg's checkout): snapshots ok, served hashes ok for both arms, compiled program 8737f212c0ff,
budget 229 s, every hold `DRY ok`. Reader self-test `p137-read.mjs --selftest` 8 ok; on T-194's E1 files it reproduces
T-194's lastScreen after-touchend counts (24 / 19 / 5).

## 4. What repaints on a toolbar step (Chrome census, OBSERVED)

Probe `endbg-chrome.mjs --mode census --arms C,nobg,C,nobg` (shared slot, 11:45Z; read `out/end-bg/census-read.mjs`, both
local). At each morph position the page sits still with the finger down. A ~700 ms control window is followed by a
toolbar step window (innerHeight 775 → 815 or back), 3 cycles per run, 2 runs per arm, so 6 windows per cell. Chrome's
emulated resize changes every viewport unit, not only dvh, so it shows more invalidation than WebKit would. These are
counts, not timing.

| position, step | paints C / nobg | raster tasks C / nobg | layouts | nodes repainted on the step (both arms) |
|---|---|---|---|---|
| m0 (menu closed), 775→815 | 12.5 / 12.5 | 12.5 / 11.0 | 5 | page layer, row-title layers, stage artboard, pain-sticky |
| m0, 815→775 | 12.0 / 12.5 | 11.3 / 8.8 | 5 | same |
| mhalf, 775→815 | 122 / 128 | 68 / 55 | 6 | + orders card, stage artboard, menu photo wall track, svg |
| mhalf, 815→775 | 80 / 80 | 109 / 98 | 6 | same |
| m1 (menu open), 775→815 | 79 / 77 | 29 / 24 | 5 | page layer, row titles |
| m1, 815→775 | 112 / 109 | 120 / 89 | 12 | + photo wall track (16 paints, ~1.05 M px² clip), header 6 |

- Every toolbar step repaints the same nodes, the same number of times, with or without the backgrounds. The step
  (layout 5-12 per window, the same in both arms) triggers the repaint, not the pictures.
- Removing the pictures cuts the raster work of those repaints by 10-26 %, and does not touch the number of paints or
  layouts. No image decodes ran in any window (D 0): the pictures are decoded once and kept.
- The biggest repainter at the open menu is the photo wall (`.start-selling-morph-col-track`): 16 paints per shrink step
  at m1. With nobg its images are hidden, but the track still repaints.
## 5. P-137 result (phone, G driver, xcode-serious; owner's cross-check read, the official ops read pending)

Block 2026-10-05 11:51-12:47Z by iphone-runner: 7/7 holds VALID, no tail re-runs (N5: nothing ran outside the C V V C
order), sentinels S0 PASS (55.7 fps, slow 0.033) and S1 PASS (52.7, 0.055), every thermal gate Serious (Xcode-induced),
battery 36.8 → 39.3 °C. Read `node fixes/end-bg/phone/p137-read.mjs <runner>/out/p137/runs` (reader b6d24ad5e73c on
p129-read 06f74f5d19ca, N1); only the block's own C runs (N3).

| run | arm | n | >30 | >34 | >38 | >46 | >50 | >54 | busy MAIN / RENDER / MIXED at >34 | toolbar-step share |
|---|---|---|---|---|---|---|---|---|---|---|
| EC1 | C | 364 | 36 | 30 | 24 | 15 | 15 | 12 | 3 / 5 / 22 | 0.60 |
| EV1 | V | 428 | 5 | 2 | 1 | 0 | 0 | 0 | 2 / 0 / 0 | 0.50 |
| EV2 | V | 431 | 6 | 3 | 3 | 1 | 1 | 1 | 2 / 0 / 1 | 0.67 |
| EC2 | C | 387 | 23 | 17 | 9 | 3 | 0 | 0 | 5 / 2 / 10 | 0.88 |
| EC3 | C | 392 | 23 | 14 | 7 | 5 | 3 | 2 | 2 / 3 / 9 | 0.79 |
| EV3 | V | 424 | 5 | 3 | 1 | 0 | 0 | 0 | 3 / 0 / 0 | 0.67 |
| EV4 | V | 428 | 8 | 5 | 3 | 1 | 1 | 0 | 4 / 1 / 0 | 0.80 |
| EC4 | C | 390 | 29 | 15 | 10 | 2 | 2 | 1 | 4 / 3 / 8 | 0.87 |

- **Verdict CAUSE** at >34: max(V) 5 < min(C) 14, median V 3 ≤ 0.5 × median C 16. Twins >30 (26 vs 5.5) and >38 (9.5 vs 2):
  CAUSE, so not threshold-sensitive. Counts basis: median n 388.5 vs 428 (+10 %, under the 15 % guard).
- >50 (reported only): C median 2.5, V 0.5; NOT SHOWN at >50/>54 (EC2 has 0), CAUSE at >46.
- What goes away: the MIXED slow frames (49 of 76 at >34 on C, 1 of 13 on V); MAIN-class ones stay (14 vs 11). Paint of
  these layers costs main-side time on the iPhone far beyond what Chrome's census shows (OBSERVED; WebKit mechanism
  being checked against source).
- Predictions: #1 CAUSE (registered p 0.08) happened; #2 (V median ≥ 10) failed; #3 (V toolbar-step share ≥ 60 %) held
  (median 0.67, pooled 9/13). Both misses rest on one wrong model: that removing paint deletes only RENDER-class frames.
  On the iPhone it also deletes MIXED ones.
- The official read (ops-reader-P137) gives the same DECISION line and per-run numbers.
- WebKit mechanism (helper read of WebKit main a1c4dcf7, partly CONFIRMED): the paint walk runs on the WebContent main
  thread inside the rendering update (`RemoteLayerTreeDrawingArea::flushLayers`, `RemoteLayerBackingStoreCollection::
  paintReachableBackingStoreContents` paints the stores serially). On iOS DOM rendering goes to the GPU process by default
  (`ENABLE_GPU_PROCESS_DOM_RENDERING_BY_DEFAULT`, PlatformEnableCocoa.h), so the main thread records draw commands and the
  GPU process rasterizes. A layer whose size changes gets a new backing store (`ensureBackingStore` clears it): a full
  repaint. Whether GPU replay back-pressure stalls the next update: UNRESOLVED.
- User blind swipe pair C-069 (12:53-12:56Z, coin-flipped order): the user picked V (no backgrounds) as following the
  finger better, difference 3 of 5.
- The user accepted this as proof (T-193 #28): no sub-arm attribution. Next is an all-images optimization proposal.

## 6. All-images proposal (PR-025, user T-193 #28, T-197)

Every image on the page counted in Chrome (`img-scroll.mjs`, one load plus a scripted scroll at 430x775 DPR 3; "drawn" =
a PaintImage for that URL, since an IntersectionObserver misses wall images whose src is set late). Options built by
`img-build.mjs --option A|B|C` into ignored overlays (sips/avifenc in a `--no-timing` hold; no image bytes are committed
or in any patch.diff, Hard rule 3). Re-encoding is a visual change, so it is a proposal, not a silent fix.

| option | what | download on a phone | image decodes at load |
|---|---|---|---|
| today (C) | | 10.4 MB, 89 files | 36 |
| A lighter files | resize to 3x the shown size where it is over 1.15x; keep the original when the result is not smaller (5 files); wall template `loading="lazy"` (Safari 15.4, webkit.org/blog/12445) | 6.6 MB, 81 files | 27 |
| B A + AVIF | A, then AVIF q68 where the URL is a literal in JS/CSS/HTML (Safari iOS 16, webkit.org/blog/13152); 3 runtime-built seller paths right-size only | 4.5 MB, 89 files | 16 |
| C baked end backgrounds | each end stage's picture + grain + blend flattened into one JPEG at the shown size, at <= 640 px only | 11.0 MB | |

- Chrome scroll counts are the same in all options (draws ~916-920, raster ~970-985, paint ~1298-1368): Chrome can't
  show C's gain, which is a WebKit paint cost (section 5).
- Look check (`look-chrome.mjs`, full page every 0.75 viewport): C changes pixels only inside the stage boxes (mostly
  <= 20 levels); A and B change the avatars at y 2905 (0.06-0.07 %). All three are T3 (proposal) by the pixel rule.
- PR-025 rev 2 (rev 1 held because 6 resized files had come out bigger) is with the user, with Try-it pages per option.
  Its text says C may not remove the whole end-screen lag (section 7).

## 7. Pictures vs title sweeps (Chrome census, OBSERVED; finding F-289)

The nobg arm in P-137 also removed the gradient of three animated colour titles (doc, earn, secure; a 4 s
`background-position` sweep on `background-clip: text`, CSS l.6057-6118). Lead ruling: measure the split before any
title work. One shared slot, `endbg-chrome.mjs --mode census`, arms C, pictures-off (nobg minus the row-title lines),
titles-off (the 6 row-title lines only), both-off (nobg); 3 morph positions x 6 at-rest windows + 3+3 toolbar steps.
Census `out/end-bg/census-2026-10-05T15-02-55-649Z.json` (ignored).

| paints per window at the end (m1) | C | pictures-off | titles-off | both-off |
|---|---|---|---|---|
| at rest | 73.5 | 72.7 | 71.7 | 74.0 |
| step 775 -> 815 | 88.3 | 95.7 | 69.0 | 71.0 |
| step 815 -> 775 | 100.3 | 100.3 | 112.3 | 107.0 |

- All four arms are the same within their run spread at m0, m0.5 and m1. The secure and organized title spans repaint
  ~20 times per window in every arm, also with `background-image: none` (the sweep animation keeps invalidating;
  organized is in no arm).
- Both-off is the arm that cut phone slow frames 16 -> 3 in P-137, yet its Chrome counts equal C's. So the number of
  paints is not what differs; what each paint costs is (a picture with blend vs an empty box), and Chrome counts don't
  measure that. **Chrome counts cannot split pictures from titles** (OBSERVED in our setup).
- The decisive check needs per-paint cost on WebKit: a phone Timeline block with arms C / pictures-off / titles-off, or
  Simulator paint durations. Asked of the lead (ticket); no `end-titles` topic until it shows the titles' share.
- Correction to "with `background-image: none`" above (found while writing P-144, from the Chrome inventory
  `out/end-bg/inv-2026-10-05T11-23-24-796Z.json`, OBSERVED): at phone width the sweep titles take the
  `@supports (-webkit-mask-clip: text)` path, where the span's own background-image is already none and the moving
  gradient sits on its `::after`, masked to the text. nobg and titles-off set both the span and its `::after` to none
  (doc, earn, secure); the mask and the animation stay. So "the titles keep repainting with their gradient removed" holds
  for doc/earn/secure; organized keeps its gradient in every arm.

## 8. Prediction P-144: pictures vs title sweeps, paint time per toolbar step (Simulator Timeline, registered before data)

**Card rev 1, before any data.** P-id P-144 (mgmt-clerk-1). Lead ruling on F-289: the cheaper path first; a phone
Timeline ticket (G, xcode-serious) only if the Simulator can't split them. Next: the lead's Opus pre-data read, then his
signature. No run, dry run included, before the signature.

- **Question.** On the end screen of C, the nobg arm cut phone slow frames 16 -> 3 (P-137, CAUSE). nobg removes two
  things: the stage pictures, grain and blend layers (pictures-off, `pic`), and the gradients of three sweeping row
  titles, doc, earn and secure (titles-off, `tit`). Which of the two carries the paint cost of a toolbar step there?
- **Why it matters.** PR-025's option C (baked backgrounds) removes only the pictures. If the titles carry a real share,
  they get their own topic (`end-titles`, a proposal or a pixel-identical compositor version) and the user is told C alone
  is not expected to remove the lag. Chrome cannot answer it (section 7, F-289).
- **What is known** (our data only):
  - P-137 (phone G, xcode-serious): nobg CAUSE at >34 (C median 16, V 3); MIXED-class slow frames vanish.
  - Chrome census (F-289): paint counts per window equal in C, pic, tit and nobg; no durations.
  - WebKit (section 5, helper read of WebKit main a1c4dcf7, partly CONFIRMED): the paint walk runs on the WebContent main
    thread in the rendering update; on iOS DOM rendering goes to the GPU process by default, so the main thread records
    draw commands and the GPU process rasterizes. **Risk named before data:** WebKit Timeline's Paint records on the
    WebContent side may show the recording only, not the raster of a picture. Then M1 cannot see nobg's effect, the
    control fails, and the card ends CONTROL-FAILED (the outcome that sends the question to the phone ticket).
- **Base.** main as of `d9dabfc7` (this branch rebased on it). C is served from the `fixes/end-bg` overlay: v9-final +
  morph-scroll rev 7d, JS `1b2eecc66011`, CSS `e1359ab9994a` (the bytes P-137 measured as C). The driver checks the served
  hashes and `x-mirror-source: overlay` through the http twin before every hold (exit 26).
- **Arms** (`eb-inject.mjs`, appended as one `<style id="eb-arm">` after every page load, before the Timeline starts;
  paint-only properties: background-image, mix-blend-mode, visibility; the self-test checks it):

  | arm | CSS | asks |
  |---|---|---|
  | C | none | control |
  | C2 | none (C under another label) | A/A pair: the instrument's noise |
  | nob | `nobg.css` `d566af712894` (P-137's V) | positive control, in every hold |
  | pic | `sim/pictures-off.css` (nobg minus its six title lines) | pictures alone |
  | tit | `sim/titles-off.css` (the six title lines: doc, earn, secure and their `::after`) | the three titles alone |

  pic + tit = nob, selector for selector (self-test). The organized title's sweep and every title's mask and animation
  stay in all arms. All arms change the look: mechanism only, never shipped, no pixel check.
- **Applied probes** (counts and booleans, read at the end of each run): the stage grain's background
  (`.start-selling-platform-stage-grain`) and the secure title's (`.is-payment .start-selling-platform-row-title-secure`,
  span or `::after`) must be on/off as the arm says, and the style element present only in nob/pic/tit. A run that fails
  is INSUFFICIENT; a C that fails fails the replication gate.
- **Stimulus `end-cycle-v1.json`** (compiler hash `c9e62ddadacc`): reload, 3 s idle, drags of 520 px down the page until
  the end (a runtime loop, cap 20), then 6 cycles at the end: a finger-down drag of 400 px (the page goes up, the toolbar
  expands) and a finger-up drag of 440 px (back to the end, the toolbar collapses). Drags end at rest. On this build docH
  is about 6740 and max scroll about 5964, so every cycle stays in the last-screen band. Planned toolbar steps in the band:
  12 per run.
- **Instrument and filter** (`p144-lib.mjs`, frozen):
  - Frames: the longest recorded segment; a frame is BAND-MOVING when innerHeight is strictly between the run's two
    toolbar states and scrollY >= docH - 2 innerHeight (P-137's last-screen band). n = such frames; a run counts at n >= 8.
  - A Timeline record belongs to a frame when it starts in (t - dt, t].
  - **M1 (primary):** per frame, the summed duration of the Paint records (WebKit nests them in Composite); per run, the
    median over the band-moving frames.
  - **M2 (pre-registered fallback):** the same with the Composite records (the layer flush that contains the paint walk).
    M2 replaces M1 for the whole card only when M1's control (or replication) fails in every hold and M2 replicates with
    its control passing in every hold. Otherwise M2 is reported, never read.
  - Descriptive only: Paint records per frame, painted area (clip quads).
  - Ratio = arm metric / mean metric of the nearest C before and after it in its hold. LOCATES <= 0.30, PARTIAL <= 0.70,
    NONE otherwise (P-133's bands).
- **Order: three holds of 5 steps**, each with its own C pair and its own nob; pic, tit and C2 twice each, in two holds, in
  rotated positions:

  | hold | steps |
  |---|---|
  | E1 | `C:H1 nob:H1 pic:H1 tit:H1 C:H2` |
  | E2 | `C:H3 tit:H2 nob:H2 C2:H1 C:H4` |
  | E3 | `C:H5 C2:H2 pic:H2 nob:H3 C:H6` |

  The driver accepts only these holds with exactly these steps (exit 2 otherwise).
- **Dry run (count-only, after the signature, before any Timeline data).** `dry-p144.mjs`, one shared Simulator slot, no
  Timeline, no timing number: one C run and one nob run with the logger. A run passes when: no abort or error; the
  approach loop ended at the end of the page; 12 cycle strokes; the logger saw >= 8 toolbar steps in the band; the arm's
  probes are right. It times each step (open + gesture). Rule, from the mean step s (estimate = s + 10):
  - estimate x 5 + 30 <= 500 s: plan E above;
  - else estimate x 4 + 30 <= 500 s: plan F, six holds of 4 steps (`C nob X C` / `C X nob C`, X = pic, tit, C2 twice each,
    nob in every hold; `p144-lib.mjs` PLAN4);
  - else: the design fails its budget; no data; back to the ops read and the lead.
  A failing run: DRY FAIL, no Timeline data, the script is revised and the card goes back to the read.
- **Holds.** Normal exclusive holds, `--max-seconds 600 --wait 14400`, one FIFO entry at a time, in order, in the
  background; `SB_BUDGET_S=500`; DEFERRED while a phone block is marked. Hold E1 (the others the same with their steps):

  ```sh
  node tools/lock.mjs run chrome-measure --max-seconds 600 --wait 14400 --owner fix-end-bg -- sh -c \
    'node tools/fix.mjs serve end-bg > out/end-bg/serve-p144.log 2>&1 & S=$!; \
     node tools/wait.mjs serve out/serve-end-bg.json --pid $S --owner fix-end-bg --timeout 60 && \
     SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-end-bg -- \
       node fixes/end-bg/sim/sim-p144.mjs E1 C:H1 nob:H1 pic:H1 tit:H1 C:H2; E=$?; kill $S; exit $E'
  ```

  The driver: served bytes (26); per step the host rule, `sim.mjs open`, `sim.mjs gesture end-cycle-v1.json --timeline
  --inject eb-inject.mjs`; the first-run gate after the first step (C applied, docH0 > 0, n >= 8; else 27); the budget
  stop (dropped steps logged, not scored).
- **Host-load rule** (P-141 rev 1.1's, unchanged): load1 > 200 at a step start exits 28 and the hold is VOID-HOST. Its
  folder moves to `<hold>-void1` (kept, reported, never scored) and the hold re-runs once from an empty folder; a second
  VOID-HOST of one hold stops the card. 200 is the lead's P-141 value, set from P-133's step-start loads on this host, not
  from any P-144 number (there is none). load1 at every step's start and end is logged and reported.
- **Per hold, right after it** (before anything is scored): `check-p144.mjs out/end-bg/simp144 <hold> --json
  fixes/end-bg/sim/p144-check-<hold>.json`. HOLD-FAIL (exit 3) when a run that ran has no Timeline file, an abort, an
  error, an approach loop not ended at the end, cycle strokes != 12, or n < 8: the hold is not scored, no rescue, and the
  remaining holds stop (to the lead). Reported, never failing: n below 12, band toolbar steps, docH, css sha.
- **Stop rules** (P-141 N3's runner): exit 0 -> the check, then the next hold; exit 28 -> the void folder, one re-run; any
  other non-zero (26, 27, 2, 124, a lock or wait timeout) or HOLD-FAIL -> stop the remaining holds, to the lead. A later
  hold runs whatever the earlier holds' values are; nothing is scored before the last hold.
- **Scoring** (after the last hold): `score-p144.mjs out/end-bg/simp144 E1 E2 E3 --json fixes/end-bg/sim/p144-score.json`.
- **Rules** (frozen before data, `p144-lib.mjs` scoreHold / armCall / cardReading):
  1. **NOT REPRODUCED** when any hold's C runs fail the replication gate: every C applied, counted, metric > 0 and Paint in
     at least half its band-moving frames. No arm is judged.
  2. **CONTROL-FAILED per hold:** nob not LOCATES or PARTIAL; that hold's other arms are not read (reported). In every
     hold: the card status is CONTROL-FAILED, which is the "Simulator can't split them" outcome.
  3. **VOID per hold:** |last C - first C| / first C > 0.30; its arms are not read.
  4. **A/A:** any C2 run PARTIAL or LOCATES in a read hold: AA-FAILED; no pic/tit reading (reported only). Each C2
     ratio's distance from 1 is reported as the noise beside the calls.
  5. **GEOMETRY:** an arm whose final docH differs from a neighbouring C's by > 2 px is not judged.
  6. **Calls per arm over its runs** in read holds: LOCATES when both LOCATE or the mean ratio <= 0.30; PARTIAL when the
     mean <= 0.70; NONE otherwise; one valid run: its call, marked "one run".
  7. **Reading** (rules 1-4 passed): pic LOCATES/PARTIAL and tit NONE: **PICTURES** (no `end-titles` topic; PR-025's
     option C is the lever on this instrument). tit LOCATES/PARTIAL and pic NONE: **TITLES** (open `end-titles`; tell the
     lead and the user that C alone is not expected to remove the lag). Both: **BOTH** (open `end-titles` too; both shares
     reported). Neither while nob passes: **JOINT** (only removing both helps, or the split is not additive; to the lead,
     no topic).
  8. A Simulator ratio is never a phone result and never a gain. Descriptive: (1 - pic) + (1 - tit) vs (1 - nob).
- **Predictions** (registered before data; informed by P-137's result and the Chrome census, the only data seen on these
  arms):

  | # | prediction | p |
  |---|---|---|
  | 1 | the dry run passes and picks plan E | 65 % |
  | 2 | all holds pass the n check | 80 % |
  | 3 | C replicates on M1 in every hold | 70 % |
  | 4 | nob LOCATES or PARTIAL on M1 in every hold (no metric switch) | 45 % |
  | 5 | the card ends READ (on M1 or M2) | 50 % |
  | 6 | given READ: pic LOCATES or PARTIAL | 75 % |
  | 7 | given READ: tit LOCATES or PARTIAL | 30 % |
  | 8 | given READ: the reading is PICTURES | 55 % |
  | 9 | both C2 runs NONE | 85 % |
  | 10 | no arm GEOMETRY | 90 % |
  | 11 | every run passes the applied probes | 85 % |
  | 12 | no VOID-HOST hold | 75 % |

  Scoring precedence (P-141 N5 style): rule 1 fails: P3 a miss, P4-P8 insufficient. CONTROL-FAILED card: P4 a miss, P5 a
  miss, P6-P8 insufficient. AA-FAILED: P9 a miss, P6-P8 insufficient. PARTIAL counts as a hit for P6 and P7.
- **Pins** (sha256/12):
  - stimulus `sim/end-cycle-v1.json` `258b9dadae1e` (compiled program `c9e62ddadacc`);
  - inject `sim/eb-inject.mjs` `20b18b4de87a`; rules and filter `sim/p144-lib.mjs` `5cc29ba45734`;
  - driver `sim/sim-p144.mjs` `a86d5b205362`; dry run `sim/dry-p144.mjs` `3ed80224b792`; check `sim/check-p144.mjs`
    `8e44588002ce`; scorer `sim/score-p144.mjs` `f1c45c4e292b`;
  - self-test `sim/p144-selftest.mjs` `c8402de03ae7`: `SELFTEST ok 87 checks` (the stimulus compiles to one approach loop
    and 12 guarded cycle strokes; pic + tit = nob selector for selector, disjoint, paint-only properties; the applied rule
    per arm; both plans: C bracket, nob in every hold, pic/tit/C2 in two holds; the budget and host thresholds; the band
    filter and the per-frame metrics on a synthetic record; every call, gate, reading and the metric switch; the dry-run,
    n-check and first-run gates);
  - arm CSS: `nobg.css` `d566af712894`, `sim/pictures-off.css` `2f316f33d828`, `sim/titles-off.css` `6bc2f3c17007`;
  - served build: JS `1b2eecc66011`, CSS `e1359ab9994a`.
- **Output.** `out/end-bg/simp144/<hold>/` and `out/end-bg/dry144/` (ignored). Committed after the last hold:
  `sim/p144-check-<hold>.json`, `sim/p144-score.json`.

### P-144 addendum rev 1.1 (ops-reader-P144 pre-data read, 15:31Z: PASS with notes N1-N7; before any data)

Text only: no pinned file changes, so the pins above stand. Where this addendum and the card differ, the addendum holds.

- **N1, plan bound to the dry run.** The plan is the one written in `out/end-bg/dry144/dry.json` (`plan`: E or F),
  committed with the results as `sim/p144-dry.json`. Only that plan's full hold set runs and is scored (E1-E3, or F1-F6);
  plans never mix; no counted hold runs before `dry.json` exists with DRY PASS. The score command names exactly that
  plan's holds.
- **N2, dropped steps.** A hold in which the budget stop dropped any step is HOLD-FAIL: not read, the remaining holds
  stop, to the lead (the card's "scored against one C" and "drift n/a" cases no longer arise).
- **N3, precedence cases the card left open:**
  - (a) DRY FAIL or a failed design budget: P1 a miss, P2-P12 insufficient; no data.
  - (b) Plan F picked: P1 a miss; the card continues.
  - (c) The card stops on a HOLD-FAIL (n, or a dropped step per N2) or a second VOID-HOST: the card is INCOMPLETE. P2 is
    a miss for an n failure, P12 a miss for a second VOID-HOST; everything else insufficient; earlier holds are not
    read alone.
  - (d) No hold usable only because of drift (every non-VOID hold failing nothing else): the status is **VOID**, not the
    CONTROL-FAILED that `cardReading` prints. P4 is scored from each hold's own control, P5 a miss, P6-P8 insufficient.
  - (e) Status READ with reading INSUFFICIENT: P5 a miss, P6-P8 insufficient.
- **N4, what informed the card (disclosure).** Before M1 was made primary, M2 the fallback and P4 set at 45 %, I read one
  Simulator Timeline file with the scratch scripts `out/end-bg/sim/tltypes.mjs` and `tlnest.mjs` (about 15:12Z):
  toolbar-resize's P-133 capture `simp133/A1/tl-C-H1.json` (fix-toolbar-resize's worktree; the hero zone, v9-final + 7d,
  no end-bg arm). In that whole run Paint records summed to about 0.28 s against about 13 s of Composite, and every Paint
  record sat inside a Composite. It is not an end-screen capture and not C or nob of this card, but it informed the M1/M2
  choice and P4. F-290 (the Chrome inventory) informed the title probe and tit's selectors.
  `research/image-cost` §0 (Simulator: Paint about 0.25 s against about 8 s of Composite per scroll) says the same; I
  can't rule out having read it before this card (an earlier part of my session is only a summary to me), so it is
  labelled as seen, informing M1/M2 and P4 too.
- **N5, text.** `chooseMetric`'s comment says "every hold that replicates on M1"; the code and the card use every hold.
  The card wins.
- **N6, what tit removes.** tit and nob remove the moving gradient only. The `::after` box, its animation, the span's
  text mask and the organized title's sweep stay in every arm. A tit call is about the titles' gradient paint, not about
  the sweep's layer or animation cost.
- **N7, base.** The branch is rebased on main `598d9efa` (docs only after `d9dabfc7`: the P-144 reservation).

### Result P-144: CONTROL-FAILED on M1 (the Simulator's Paint time does not see nobg's effect); no reading

Owner's read, for the official result read. Dry run (count-only, 2026-10-05, before the holds): DRY PASS, C 69.4 s and
nob 69.1 s per step, mean 69.3 s, plan E (`sim/p144-dry.json`, N1). Holds E1-E3, one normal exclusive hold each,
16:11-16:52Z,
every exit 0, no VOID-HOST, no dropped step, every check HOLD-OK (`sim/p144-check-E1..E3.json`). Score:
`score-p144.mjs out/end-bg/simp144 E1 E2 E3` -> `sim/p144-score.json`.

| hold | run | n | M1 paint ms | M1 ratio, call | M2 composite ms | M2 ratio (not read) |
|---|---|---|---|---|---|---|
| E1 | C-H1 | 100 | 0.638 | | 23.6 | |
| E1 | nob-H1 | 135 | 0.514 | 0.882 NONE | 14.8 | 0.685 |
| E1 | pic-H1 | 137 | 0.406 | 0.696 PARTIAL | 14.2 | 0.657 |
| E1 | tit-H1 | 121 | 0.522 | 0.895 NONE | 18.4 | 0.854 |
| E1 | C-H2 | 114 | 0.528 | | 19.5 | |
| E2 | C-H3 | 116 | 0.545 | | 20.0 | |
| E2 | tit-H2 | 123 | 0.499 | 0.902 NONE | 18.2 | 0.938 |
| E2 | nob-H2 | 129 | 0.484 | 0.874 NONE | 15.2 | 0.785 |
| E2 | C2-H1 | 124 | 0.560 | 1.012 NONE | 19.0 | 0.982 |
| E2 | C-H4 | 118 | 0.562 | | 18.7 | |
| E3 | C-H5 | 114 | 0.562 | | 19.1 | |
| E3 | C2-H2 | 111 | 0.544 | 0.957 NONE | 19.5 | 1.010 |
| E3 | pic-H2 | 134 | 0.523 | 0.920 NONE | 15.7 | 0.814 |
| E3 | nob-H3 | 133 | 0.489 | 0.860 NONE | 14.8 | 0.768 |
| E3 | C-H6 | 117 | 0.575 | | 19.4 | |

- **Rules.** Rule 1: C replicates in every hold on M1 (drift 0.172 / 0.031 / 0.023, no VOID). Rule 2: nob is NONE on M1
  in every hold (0.882 / 0.874 / 0.860), so every hold is CONTROL-FAILED and the card status is **CONTROL-FAILED**. The
  metric switch does not apply: on M2 the control passes in E1 only (0.685; E2 0.785, E3 0.768), so M2 stays reported,
  not read. No pic/tit call, no reading; `end-titles` is not opened by this card.
- **What it means (the card's pre-named outcome):** the Simulator's WebKit Timeline cannot split pictures from titles on
  this instrument; the question goes to the phone Timeline ticket (G, xcode-serious) as the lead ruled.
- **Descriptive only, decides nothing:** nob's M1 effect is small (about -13 %) next to P-137's phone effect. On M2
  (Composite, the flush that holds the paint walk) every nob and pic run is lower than its C neighbours (0.66-0.81) and
  the tit runs less so (0.85, 0.94); C2 stays at 0.98-1.01. These are unread numbers under the card's rules, not a
  split; they may inform the phone ticket's design (disclosed if they do). Paint records per frame 12-13, painted area
  about 0.83-0.96 million px per frame in every arm. Every run passed the applied probes; docH 6814 -> 6850 in all.
- **Host:** load1 at step starts 7.7-106.4 (all below 200); the Simulator's background was settled at session start.
- **Predictions** (scored with N3's precedence: a CONTROL-FAILED card makes P4 and P5 misses and P6-P8 insufficient):
  P1 hit (DRY PASS, plan E). P2 hit (all holds pass the n check, n 100-137). P3 hit (C replicates on M1). P4 miss.
  P5 miss. P6-P8 insufficient. P9 hit (C2 NONE in both runs: 1.012, 0.957). P10 hit (no GEOMETRY). P11 hit (every run
  applied). P12 hit (no VOID-HOST). 7 hits, 2 misses, 3 insufficient.
- **Official read and lead ruling.** ops-reader-P144r (2026-10-05 17:00Z): CONFIRMED with notes N1-N4 (pins, dry run
  before E1, check and score re-run deep-equal, M2 switch applied correctly). Lead ruling on N1: P9 is **insufficient**,
  not a hit (no hold was read, so the per-run C2 calls score nothing). Final tally: **6 hits, 2 misses, 4
  insufficient.** N2: P4 and P5 are two misses on one model (the Simulator's Paint time should see nobg); it did not.
- **Mechanism note (OBSERVED in our setup, cause unknown):** WebKit Timeline Paint records on the WebContent side sum to
  about 0.5 ms per band frame in every arm; the frame's Composite is about 15-24 ms. The pre-named risk (picture raster
  outside the main thread's recorded Paint) fits this, but nothing here confirms it.

### Prediction P-145: pictures vs title sweeps on the iPhone (G driver, Timeline, xcode-serious; DRAFT for the pre-data read)

Pre-staged on the lead's ruling after P-144 (2026-10-05). It runs after the user reconnects and v9.2's phone block has run.
It needs the ops pre-data read and the lead's signature before any data.

**Why a phone card.** P-144 is CONTROL-FAILED. The Simulator's WebContent Paint time did not see nobg's effect: nob's
ratio was 0.86-0.88 (NONE) in every hold, while P-137 showed CAUSE on the phone. P4 and P5 were two misses on one model,
that Simulator Paint time tracks the phone's end-screen cost (N2). That model failed, and this card does not reuse it. It
reads the phone's own slow frames with P-137's metric and rule, the read that already found CAUSE for nobg on this device.

**Question.** On the iPhone, in the last screen after the finger lifts: do the slow frames P-137 removed with nobg come
from the background pictures, from the gradient title sweeps, or from both?

**Arms.** Same base and immutable snapshots, paint only. Arms and files were fixed before P-144's data:

| arm | build | JS | CSS | snapshot |
|---|---|---|---|---|
| C | v9-final + morph-scroll 7d (P-137's C) | 1b2eecc66011 | e1359ab9994a | `out/snapshots/endbg-C-e1359ab9994a` |
| P | C + `sim/pictures-off.css` (2f316f33d828) | 1b2eecc66011 | a9fd8338d8ed | `out/snapshots/endbg-P-a9fd8338d8ed` |
| T | C + `sim/titles-off.css` (6bc2f3c17007) | 1b2eecc66011 | 8f4d806323a9 | `out/snapshots/endbg-T-8f4d806323a9` |

The snapshots are read-only in fix-end-bg's worktree. P and T are plain concatenations, built like P-137's V. P + T
covers what nobg removes, except the organized title, which is in no arm (F-290; the mask and animation stay in every
arm, §7).

**Driver, profile, procedure.** As P-137 (§3):
- driver G, `fixes/morph-scroll/g-fastshort-v1.json` (df597802d2f0), compiled program 8737f212c0ff, GESTURE_BUDGET_S
  about 229, E procedure;
- profile xcode-serious: `thermal-gate.mjs --expect serious --max-c 44 --accept-induced` on server B, at each phone
  hold's edges; no heat pre-warm and no cooling wait (CLAUDE.md "Sentinel");
- plain http, `--vendors=local --latency 150`.

**Block** (CLAUDE.md "Phone blocks", "Timeline blocks"). Items, in order:
- one uncounted warm-up per arm's port (WC, WP, WT, Timeline off, `--warmup`);
- an uncounted Timeline-OFF sentinel S0 on C after the warm-ups;
- 9 counted runs, Timeline on in every arm, in a rotated Latin square: EC1 EP1 ET1 | EP2 ET2 EC2 | ET3 EC3 EP3. This is
  the 3-arm form of C V V C. A Timeline-on C run does not replace S0: the card keeps both sentinels;
- at most 2 re-runs of counted runs that fail a run gate, then the Timeline-OFF end sentinel S1 on C;
- no attribution runs.

The sentinel rule and the run gates G1-G6 are the signed P-129 reader rev 1.1's, as in P-137. A failing S0 voids the block
before any counted run; a failing S1 voids every counted run. 14-16 fs runs in 600 s `--no-timing` holds of at most 2
runs, inside two `lock.mjs run iphone --block P-145` holds:

```
part 1: H1 WC,WP | H2 WT,S0 | H3 EC1,EP1 | H4 ET1,EP2 | H5 ET2,EC2      part 2: H6 ET3,EC3 | H7 EP3 | H8 TAIL (re-runs, then S1)
```

Before every item the served JS and CSS of all three arms are hashed; a mismatch voids the hold.

**Metric and decision: P-137's, unchanged** (`p137-read.mjs` `metric` and `verdict`, imported by `p145-read.mjs`).
- Per counted run: moving lastScreen frames after a touchend, s(th) for th 30/34/38/46/50/54.
- Per arm X in {P, T} against C at >34, with at least 3 valid runs per arm:
  - CAUSE: max X < min C and median X ≤ 0.5 × median C;
  - CONTRIBUTES: max X < min C, otherwise;
  - WORSE: min X > max C;
  - NOT SHOWN: anything else;
  - THIN: fewer than 3 valid runs.
- The denominator guard (15 %) and the twins (>30, >38: "threshold-sensitive") apply per pair. >50 is reported and decides
  nothing.
- An arm **carries** when its verdict is CAUSE or CONTRIBUTES. Readings:
  - PICTURES: P carries, T does not;
  - TITLES: T carries, P does not;
  - BOTH: both carry;
  - NEITHER: neither carries;
  - THIN: an arm is THIN;
  - VOID: a sentinel failed.
- With 3 runs per arm, separation needs all 3 X runs below all 3 C runs. That is weaker than P-137's 4 v 4. Readers should
  weigh a CONTRIBUTES accordingly; the rule does not change.
- Descriptive, decides nothing:
  - the class split (busy) and the toolbar-step share;
  - per counted run, from its Timeline, the median summed Paint and Composite ms over its metric frames (`tlCost`).

**Disclosure (P-144 N4).** P-144's M2 (Composite) ratios were never read: pic 0.66/0.81, tit 0.85/0.94, nob 0.69-0.79,
C2 0.98-1.01. They did not shape the arms or the rule; both were fixed before that data. They did shape the predictions
below: they move weight towards pictures. Under P-144's rules they remain OBSERVED, unread numbers.

**Predictions (before data).**

| # | prediction | p |
|---|---|---|
| 1 | P vs C at >34: CAUSE | 0.20 |
| 1 | CONTRIBUTES | 0.35 |
| 1 | NOT SHOWN | 0.42 |
| 1 | WORSE | 0.03 |
| 2 | T vs C at >34: CAUSE | 0.05 |
| 2 | CONTRIBUTES | 0.20 |
| 2 | NOT SHOWN | 0.72 |
| 2 | WORSE | 0.03 |
| 3 | reading: PICTURES | 0.36 |
| 3 | TITLES | 0.08 |
| 3 | BOTH | 0.14 |
| 3 | NEITHER | 0.32 |
| 3 | THIN or VOID | 0.10 |
| 4 | both sentinels PASS and every hold VALID without a second block | 0.80 |
| 5 | C's median >34 lies within P-137's C range (14-30) | 0.75 |
| 6 | both pairs decide on counts (no denominator guard) | 0.70 |

Why:
- The pictures cover far more painted area in the last screen than the three title sweeps (§1, §7).
- P-144's unread Composite numbers point the same way (disclosed above).
- NEITHER stays likely. P-137's effect could need both parts at once (joint, not additive): each half alone would then
  leave C's slow frames in place. This card cannot tell joint from absent, and a NEITHER reading says so.

**Falsification.**
- PICTURES: the image work in PR-025 is the end-screen lever.
- TITLES: the sweep animation gets its own fix card (`end-titles`).
- BOTH: both levers are needed.
- NEITHER after P-137's CAUSE: the effect is joint, or it sits in what only nobg removes (the organized title, grain
  layers counted with the pictures). A follow-up needs the lead's decision. No second block of this question without one
  (sequential rule, at most 2 blocks).

**Kit and pins** (runner: iphone-runner; scripts adapted from P-137's, which were read and run once).

| file | pin |
|---|---|
| `phone/p145-serve.sh` | 3caf4f02b3f3 |
| `phone/p145-hold.sh` | 9e002d44b9a6 |
| `phone/p145-block.sh` | 794c347a6110 |
| `phone/p145-read.mjs` | 8882725a5f23 (self-test 11 ok) |
| `phone/p137-read.mjs` | b6d24ad5e73c |
| `research/serious-heat/p129-read.mjs` | 06f74f5d19ca |
| `research/serious-heat/phone/p129-gates.mjs` | a06847c64a2e |

```sh
sh fixes/end-bg/phone/p145-serve.sh start            # copies + checks the 3 snapshots, starts C, P, T, B (plain http)
TICKET=P-145 P145_DRY=1 sh fixes/end-bg/phone/p145-block.sh H1:WC,WP H2:WT,S0 H3:EC1,EP1 H4:ET1,EP2 H5:ET2,EC2 H6:ET3,EC3 H7:EP3 H8:TAIL
TICKET=P-145 node tools/lock.mjs run iphone --owner iphone-runner --block P-145 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p145-block.sh H1:WC,WP H2:WT,S0 H3:EC1,EP1 H4:ET1,EP2 H5:ET2,EC2
TICKET=P-145 node tools/lock.mjs run iphone --owner iphone-runner --block P-145 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p145-block.sh H6:ET3,EC3 H7:EP3 H8:TAIL
node fixes/end-bg/phone/p145-read.mjs out/p145/runs --json out/p145/p145-read.json
sh fixes/end-bg/phone/p145-serve.sh stop
```

Status of the kit:
- Shell syntax was checked.
- The dry run needs the servers up, so it is the runner's first step after the signature (servers and dry run need no
  phone).
- Part 1 is 10 fs runs in 5 holds: about 2300 s of runs plus 2 gates, inside 3600 s.

### P-145 addendum rev 1.1 (ops-reader-P145 pre-data read, 17:13Z: PASS with notes N1-N7 on 1ed950e3; before any data)

This addendum is README-only: no script changes and no re-pin. Where it differs from the card above, this text wins.
**SIGNED by the lead with N1-N7 as conditions** (N1 accepted as proposed; N6 accepted as a disclosed design limit).

- **N1, void holds.** A hold can end VOID:
  - exit 3: end gate, or a Mac sleep;
  - exit 4: hash or setup;
  - exit 5: start gate, or WDA;
  - exit 8: a sentinel failed.

  Before the read, the runner moves that hold's g- and tl- records to `out/p145/void/<H>/`. They do not count. The reader
  reads only what remains in `out/p145/runs`.

  A time-guard VOID (exit 7) that `p145-block.sh` retries whole, and that then ends VALID, is not a void hold. Its first
  try's files are moved aside by the retry.

  A BLOCK STOP ends the block. A restart counts as block 2 of 2, only on the lead's go.
- **N2, sentinel numbers.** The G sentinel uses the signed P-129 reader rev 1.1's criteria, as in P-137: fps ≥ 50 and
  slow share ≤ 6 %. CLAUDE.md's 58 / 44 are the S/W figures. Keeping both S0 and S1 is stricter than the minimum.
- **N3, scoring precedence.**
  - P1 or P2 is insufficient when its pair is THIN or the block is VOID.
  - P5 and P6 are insufficient when the block is VOID, and P6 also when a pair is THIN.
  - P4 is a hit only if S0 and S1 PASS and no hold ends VOID. The one exception is a time-guard retry that then ends VALID.
  - P5's range 14-30 is inclusive.
  - P3 follows the reader's READING line (THIN and VOID score as the "THIN or VOID" row).
- **N4, informed items.** This card is post-data on P-137 (same C, driver and profile) and on P-144 (same P and T CSS).
  - P1-P3 are informed by P-137's CAUSE and by P-144's unread M2 numbers.
  - P5 is informed by P-137's C range.
  - P4 and P6 are informed by P-137's run.
- **N5, text corrections.**
  - Arm P removes every non-title nobg layer, not only pictures: the gradients, the grain with its blend reset, the menu
    photo wall and the earn nav glow. PICTURES therefore reads "the non-title backgrounds carry the effect", not only
    "PR-025's image work".
  - The Falsification NEITHER line is wrong. P + T equals nobg rule for rule (30 rules), and the organized title is in
    neither arm nor in nobg, so "what only nobg removes" is empty. NEITHER means a joint (non-additive) effect, or one
    that 3 v 3 runs cannot separate.
  - The header comment of `sim/titles-off.css` still names images.css. This is cosmetic, so no re-pin.
- **N6, design limit (disclosed).** T is the first item of its 600 s hold in all three counted runs (H4, H5, H6). C is
  first once (H3) and P is first once (H7, alone). No grouping of 2 runs per hold balances this across 9 runs. A
  first-in-hold effect would bias T alone; the reader does not correct for it. Lead condition: the result names this
  limit next to any T verdict and any reading that involves T (TITLES, BOTH, NEITHER).
- **N7, two more pins.** Both equal main and appear in every PIN line:

  | file | pin |
  |---|---|
  | `research/phone-thermal-gate/thermal-gate.mjs` | ecb403b3ad25 |
  | `fixes/rest-script/tools/pmcheck.mjs` | d36bd7437b7c |

  Raw hold and gate logs are never committed unscrubbed.

### P-145 block 1 (2026-10-05 22:16-22:40Z): BLOCK STOP, no counted data

- **H1 and H2 VALID.**
  - The start gate passed: xcode-serious, state Serious (Xcode-induced), battery 38.5 → 38.2 °C.
  - The warm-ups WC, WP and WT ran.
  - S0 PASSED: 55.5 fps, slow share 0.031.
- **From H3 on, the phone was too hot to measure.**
  - The gesture tool's own thermal profile check (I-186, exit 8) refused every counted run: EC1, EP1, ET1, EP2, ET2
    and EC2. The phone read **Critical**, above the Xcode condition Serious, with the battery at **40.2-40.9 °C**.
  - No counted record exists.
  - H5's end gate failed on the ceiling (Critical, battery 40.1 → 39.8 °C): exit 3, a VOID hold, and the block driver
    stopped (BLOCK STOP).
- **Lead ruling.**
  - The STOP is accepted. Block 2 of 2 is a GO, in the phone slot right after P-147.
  - Block 1's files are moved to `out/p145/block1/` (N1). The dry-run logs are in `out/p145/dry/`.
  - At block 2's start, inside the phone hold: first `wait.mjs phone-temp --below 38 --timeout 600`, then the profile
    check (`iphone.mjs profile`). If the phone is still Critical after that, the runner stops and tells the lead. No
    user step is posted without the lead's go.

## 9. Pending

- PR-025: the user's pick, then the phone test of slow frames.
- P-145 (signed, dry run ok): the runner's block after v9.2's.
- PR-025 option B (accepted 21:04Z): card P-150 in section 10. Pre-data read and signature, then the cost card, then
  the phone check after P-147 and P-145.
- The verdict per image and the ranked candidate fixes, after P-137. Wall candidates known now (bytes or memory, no
  frame effect expected): skip columns 4-5 below 640 px (pixel-identical, -2.1 MB fetched); resize graphic-designer.png,
  the only visible oversized wall image (1.22x, -2.2 MB decoded; pixel check needed); trimming the never-seen last
  items is height-dependent (not identical above H 791): proposal at most.
- Method note for other topics: `research/element-ablation/README.md`.
- How the hero-card fixes worked (re-keep-op: the revealed people card kept in its own layer at rest, so the end-of-reveal
  re-layouts went away; hero-exit-threaded: the hero exit moved to a scroll-driven animation off the main thread): both are
  layer/compositor changes; whether one fits the last screen depends on what P-137 and the census show.

## 10. PR-025 option B: recipe, cost card and phone no-worse check (P-150, registered before data)

The user accepted PR-025 with option B, "new-format" (lighter files plus AVIF), 2026-10-05 21:04Z. The lead ruled:
- the less-work landing rule applies: cost-card counts, plus a required short phone no-worse check whose named risk is
  AVIF's first decode;
- heat: Xcode Device Conditions only;
- the deliverable is a recipe; no re-encoded image is ever committed;
- B does not claim the end-screen slow frames (P-145 keeps that question).

### 10.1 What B is, and the recipe

- **Pictures.** 35 phone-visible pictures change:
  - 27 are over 1.15x what their largest phone box needs at DPR 3 and are resized to that need (16.1 → 4.0 million
    source pixels, 4.1x fewer);
  - 33 are re-saved as AVIF, and every literal reference to them is rewritten (the CSS has none, so it is unchanged).
    PR-025's text said 32; the overlay the user tried has 33, equal to the manifest;
  - 2 of the 3 seller photos whose paths are built at run time keep their format and are only resized. The third needs
    no resize and is unchanged (`skipped` in the manifest).

  Their bytes: 5,587,773 → 812,362.
- **Code.** The menu photo wall's `<img>` template goes from `loading="eager"` to `loading="lazy"`. Its columns 4-5 are
  `display: none` below 640 px, so a phone never fetches them. Safari supports lazy images since 15.4 (CONFIRMED,
  webkit.org/blog/12445) and AVIF since Safari 16 / iOS 16 (CONFIRMED, webkit.org/blog/13152).
- **Builds.**

  | arm | JS | CSS | index.html |
  |---|---|---|---|
  | C | 1b2eecc66011 | e1359ab9994a | site-pretty's (26e46ddee017) |
  | N (= B) | 049b13ced4e3 | e1359ab9994a (unchanged) | 10919c0334b4 |

- **Recipe (committed).**
  - `img/rebuild-b.mjs`: `--make-manifest`, `--build <dir> [--base-overlay d]` and `--check <overlay>`.
  - `img/b-manifest.json`, per picture:
    - the source path, its sha256 in the frozen `site/`, its size and bytes;
    - the operation: the resample size and the encoder;
    - the output path, size, bytes and sha256.

    It also records the URL edits with their replacement count per code file, the lazy edit, and each code file's base
    and output sha256.
  - Encoders, exact versions: avifenc 1.3.0 (aom 3.13.1), `-q 68 -s 6 -j 2`; sips-316, JPEG quality 90, PNG
    intermediate; macOS 26.2 (25C56).
  - `--build` refuses (exit 4) on other encoder versions or another baseline source.
  - `img/patch.diff` holds only the text changes, C → B: JS, CSS (empty) and index.html.
  - Images live only in gitignored folders: `out/end-bg/opt-B`, `out/end-bg/img-b-r1`, and the read-only snapshot
    `out/snapshots/endbg-B-049b13ced4e3`.
- **Rebuild check (done, no data).** `--build out/end-bg/img-b-r1` ran in a `--no-timing` hold (21:10Z) and printed
  `CHECK MATCH 38/38`. So the recipe is deterministic on this Mac. `--check` on the Try-it overlay the user judged
  (`fixes/end-bg-img-b/overlay`) also matches 38/38: the build that lands is the one the user accepted.
- **Another base.** On another base (e.g. v9.2), `--build --base-overlay <its overlay>` re-applies the same text edits.
  The picture shas must still match; the code shas differ, and the script prints a NOTE for each.

### 10.2 Cost card (Chrome and Simulator, counts only)

The full page, load plus one scroll to the bottom. Arms C and N are served from the read-only snapshots
`out/snapshots/endbg-C-e1359ab9994a` and `out/snapshots/endbg-B-049b13ced4e3`.
- **Chrome.** `img-scroll.mjs --arms C=<C snapshot>,B=<N snapshot> --runs 3`, i.e. 3 rounds with the arms alternating
  (C B, B C, C B). Headless, 430x775 DPR 3, touch, CPU 1x, cache off. Shared lane, probe weight, ≤ 300 s.
- **Simulator.** `img/sim-b.sh` in two functional sessions: K1 C then B, K2 B then C. Each session is one page load
  plus the fs gesture `--count-only`, with the in-page counter `img/img-inject.mjs`, which records:
  - Resource Timing picture bytes (`encodedBodySize`) and the number of files;
  - a WebKit decode test of every fetched AVIF (`new Image()` then `decode()`);
  - broken `<img>` elements.

  Shared lane, simulator weight, ≤ 300 s each. Safari's HTTP cache is emptied at every session start (sim.mjs).
- **Rules** (`img/cost-b.mjs`, self-test 7 ok; N against C):

  | rule | name | test |
  |---|---|---|
  | R1 | less download | Chrome max(N image bytes) < min(C), and Simulator max(N bytes) < min(C) |
  | R2 | fewer decodes | Chrome max(N decode events during the load) < min(C) |
  | R3 | no more redraw | PaintImage, Paint and RasterTask during the scroll (Chrome): WORSE when min(N) > max(C); NO-WORSE when no field is WORSE |
  | R4 | works | every N run: Chrome image responses all 200; Simulator 0 AVIF decode failures, at least 1 AVIF fetched, broken `<img>` ≤ C's in the same session |
  | R5 | enough data | Chrome ≥ 3 runs per arm, Simulator ≥ 2 per arm |

  Card outcomes, in this order:
  - INSUFFICIENT: R5 fails;
  - BROKEN: R4 fails;
  - WORSE: R3 is WORSE (named per field);
  - PASS: R1, R2, R3 and R4 all hold;
  - NOT-LESS: anything else.
- **Kit check.** The first Simulator session doubles as a kit check. If it ends VOID for a kit reason (a server, WDA, a
  hash), the kit is fixed and re-pinned before any count is read.

### 10.3 Phone no-worse check P-150 (G driver, xcode-serious; after P-142, P-147 and P-145 in the lead's order)

**Question.** On the iPhone, is option B worse than C while pictures first appear? The named risk is AVIF's first
decode.

**Arms.** C and N, from the read-only snapshots above. The runner's `p150-serve.sh` copies them and checks them: N also
file by file against the manifest (38/38).

**Procedure.** As P-137:
- driver G, `fixes/morph-scroll/g-fastshort-v1.json` (df597802d2f0), compiled program 8737f212c0ff, E procedure;
- profile xcode-serious: thermal gate `--expect serious --max-c 44 --accept-induced` at each phone hold's edges; no heat
  pre-warm and no cooling wait;
- plain http, `--vendors=local --latency 150`.

Changed from P-137:
- **Every item opens with `iphone.mjs safari-restart --url`** instead of `open`. Each run then starts in a fresh Safari
  web process, so no picture decoded by an earlier run can be reused, and each picture's first decode falls inside the
  run. Whether WebKit's memory cache would otherwise keep decoded pictures across loads in one web process is
  UNRESOLVED; the restart makes the design independent of it.
- **The served hashes include index.html.** N's page references the AVIF files from both JS and index.html.

**Block** (CLAUDE.md "Phone blocks", "Timeline blocks"). Items, in order:
- one uncounted warm-up per arm's port (WC, WN; Timeline off, `--warmup`);
- an uncounted Timeline-OFF sentinel S0 on C;
- 6 counted Timeline-on runs in C N N C C N order (EC1 EN1 EN2 EC2 EC3 EN3);
- at most 2 re-runs, then the Timeline-OFF end sentinel S1 on C.

The sentinel and run gates G1-G6 are the signed P-129 reader rev 1.1's: fps ≥ 50 and slow share ≤ 6 % (the G figures;
P-145 N2). The run is split over two `lock.mjs run iphone --block P-150` holds:

```
part 1: H1 WC,WN | H2 S0,EC1 | H3 EN1,EN2          part 2: H4 EC2,EC3 | H5 EN3 | H6 TAIL (re-runs, then S1)
```

**VOID holds** (P-145 N1's rule, carried over). A hold that ends VOID (exit 3, 4, 5 or 8) has its g- and tl- records
moved to `out/p150/void/<H>/` before the read, and they never count. A BLOCK STOP ends the block; a restart is block 2
of 2, on the lead's go.

**Design limit (disclosed).** The counted runs that come first in their 600 s hold are EN1, EC2 and EN3: N twice, C
once. The result names this next to the verdict.

**Metric and decision** (`phone/p150-read.mjs`, self-test 7 ok).
- Whole page, because pictures first appear all down the page: every moving frame of a counted run; n = their number;
  s(th) = those with dt > th, th 30/34/38/46/50/54.
- P-137's rule `verdict` compares N against C at >34 and at >50, with the 15 % denominator guard.
- **NO-WORSE PASS:** neither >34 nor >50 is WORSE (min N > max C). **FAIL:** either is WORSE, named.
  **INSUFFICIENT:** an arm has fewer than 3 valid runs. **VOID:** a sentinel failed.
- Twins (>30/>38 for >34, >46/>54 for >50): when a twin's worse-or-not differs from its main threshold, the result is
  "threshold-sensitive". That is reported and does not change the outcome.
- A better reading (CAUSE / CONTRIBUTES) is reported and claims nothing: B is not a smoothness fix.
- P-137's lastScreen-after-touchend counts and the class split are descriptive.

### 10.4 Predictions P-150 (before data)

| # | prediction | p |
|---|---|---|
| 1 | cost card PASS | 0.85 |
| 2 | Chrome image bytes: N median within ±10 % of 4.5 MB, C median within ±10 % of 10.4 MB | 0.85 |
| 3 | Chrome decode events during the load: N median ≤ 20 (C about 36) | 0.75 |
| 4 | R3 NO-WORSE | 0.90 |
| 5 | Simulator: every fetched AVIF decodes (0 failures in every N run) | 0.95 |
| 6 | Simulator bytes separate (R1's Simulator half) | 0.90 |
| 7 | phone: NO-WORSE PASS | 0.75 |
| 7 | FAIL | 0.10 |
| 7 | INSUFFICIENT or VOID | 0.15 |
| 8 | phone >34 verdict N vs C: NOT SHOWN | 0.70 |
| 9 | phone result threshold-sensitive | 0.25 |

Scoring precedence:
- An INSUFFICIENT or BROKEN cost card makes predictions 2-6 insufficient, except prediction 5 under BROKEN (scored as
  usual).
- A VOID or INSUFFICIENT phone result scores prediction 7's third row and makes predictions 8 and 9 insufficient.

**Informed.** Predictions 1-4 are informed by PR-025's own Chrome measurement: one load per build, OBSERVED, 10.4 → 4.5
MB and 36 → 16 decodes. Prediction 7 is informed by P-137's C runs (same C, driver and profile).

**Why.**
- The bytes and decodes come straight from the files: N fetches the same pictures, smaller.
- Redraw counts follow repaints, not file size; PR-025 measured 916 vs 918 PaintImage.
- On the phone, AVIF decode is more CPU per pixel than JPEG. But the decoded pixel count drops with the resize (35
  pictures, 4.1x fewer source pixels on the 27 resized ones), and WebKit decodes large pictures off the main thread when it
  can (UNRESOLVED for AVIF on iOS 26; the check measures the outcome, not the path).

**Falsification.**
- FAIL: B does not land as is. The decode cost is then the next question: per-picture first-appearance frames, and AVIF
  vs the right-sized JPEG of option A.
- NOT-LESS: the less-work premise is wrong for that count; the rule's other half is not enough to land.

### 10.5 Kit and pins

| file | pin |
|---|---|
| `img/rebuild-b.mjs` | 4d168feb8298 (self-test 5 ok) |
| `img/b-manifest.json` | 2c44c949d8a8 |
| `img/patch.diff` | ec40def78cb8 |
| `img/img-inject.mjs` | 4eebec70e95b (parse-checked) |
| `img/sim-b.sh` | 5aede15c5f9f (rev 1.1; rev 1 661a907d572a) |
| `img/cost-b.mjs` | ab1cd4046ee6 (rev 1.1, self-test 13 ok; rev 1 147a1f0d328a) |
| `img-scroll.mjs` (unchanged, used by PR-025) | 682d14b8beab |
| `phone/p150-serve.sh` | a9b059094d07 |
| `phone/p150-hold.sh` | 78965a854e29 (rev 1.2: served index pins; rev 1 1cb0b24aa2ca) |
| `phone/p150-block.sh` | d19c744265fa |
| `phone/p150-read.mjs` | b5d113ef3760 (rev 1.3, self-test 17 ok; rev 1.1 24b1ed51f58e, rev 1 382006b9f60e) |
| `phone/p137-read.mjs` | b6d24ad5e73c |
| `research/serious-heat/p129-read.mjs` | 06f74f5d19ca |
| `research/serious-heat/phone/p129-gates.mjs` | a06847c64a2e |
| `research/phone-thermal-gate/thermal-gate.mjs` | ecb403b3ad25 |
| `fixes/rest-script/tools/pmcheck.mjs` | d36bd7437b7c |
| `fixes/morph-scroll/g-fastshort-v1.json` | df597802d2f0 |

```sh
# cost card (fix-end-bg; Chrome then Simulator, shared lane)
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-bg -- \
  node fixes/end-bg/img-scroll.mjs --arms C=out/snapshots/endbg-C-e1359ab9994a,B=out/snapshots/endbg-B-049b13ced4e3 --runs 3
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-bg -- \
  node tools/sim.mjs session --functional --owner fix-end-bg -- sh fixes/end-bg/img/sim-b.sh K1 C B
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-bg -- \
  node tools/sim.mjs session --functional --owner fix-end-bg -- sh fixes/end-bg/img/sim-b.sh K2 B C
node fixes/end-bg/img/rebuild-b.mjs --check out/snapshots/endbg-B-049b13ced4e3   # rev 1.1 N7: right after the Chrome part
shasum -a 256 out/snapshots/endbg-C-e1359ab9994a/_app/immutable/nodes/2.DyWL8TcE.js   # 1b2eecc66011
node fixes/end-bg/img/cost-b.mjs --chrome out/end-bg/images/img-scroll-<stamp>.json --sim out/end-bg/simb --json out/end-bg/cost-b.json
# phone (iphone-runner)
sh fixes/end-bg/phone/p150-serve.sh start
TICKET=P-150 P150_DRY=1 sh fixes/end-bg/phone/p150-block.sh H1:WC,WN H2:S0,EC1 H3:EN1,EN2 H4:EC2,EC3 H5:EN3 H6:TAIL
TICKET=P-150 node tools/lock.mjs run iphone --owner iphone-runner --block P-150 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p150-block.sh H1:WC,WN H2:S0,EC1 H3:EN1,EN2
TICKET=P-150 node tools/lock.mjs run iphone --owner iphone-runner --block P-150 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p150-block.sh H4:EC2,EC3 H5:EN3 H6:TAIL
node fixes/end-bg/phone/p150-read.mjs out/p150/runs --json out/p150/p150-read.json
sh fixes/end-bg/phone/p150-serve.sh stop
```

Kit status: shell syntax checked; the readers' self-tests pass. The phone kit's dry run (servers, the N manifest check, served hashes, plan;
no phone) is queued in a `--no-timing` hold behind the P-142 phone block. Its result is sent to the lead and reader, and
the card is changed only by a dated addendum if the dry run finds a kit fault.

### P-150 addendum rev 1.1 (ops-reader-P150 pre-data read: FAIL, fixable before data; lead rulings F1, F2, N1-N10)

README and three kit files; no data exists. Where this differs from sections 10.1-10.5, this text wins. Re-pinned:
`img/cost-b.mjs` ab1cd4046ee6, `img/sim-b.sh` 5aede15c5f9f, `phone/p150-read.mjs` 24b1ed51f58e (table above). Every
other pin is unchanged.

- **F1, cost card code (fixed).**
  - The Simulator half of R1 read a `bytes` field that the Simulator rows did not carry. It was always false, so the
    card could never PASS.
  - The fix has two parts. `simRuns` sets `bytes = encodedBytes`, and `decide` reads `bytes ?? encodedBytes`.
  - The self-test now builds gesture-like records in a temp folder and reads them through `simRuns` and `counts()`.
    One case passes rows that carry only `encodedBytes`, 10x apart: PASS, R1 true.
- **F1, R2 restated.**
  - **R2 fewer decodes**: Chrome max(B decAll) < min(C decAll). decAll is load plus scroll, so the lazy edit moving wall
    decodes from the load into the scroll cannot count as fewer.
  - **"decAll not more"** joins R3's fields. R3 is now decAll, PaintImage, Paint and RasterTask: WORSE when min(B) >
    max(C).
  - decLoad is reported and decides nothing.
  - Prediction 3 now reads: "Chrome decode events over load and scroll: N median < C median, ranges separate (R2)",
    p 0.70.
- **F2, phone NO-WORSE (fixed).** At >34 and at >50 separately, N is WORSE when either test holds:
  - (a) full separation: min(N) > max(C);
  - (b) the median bound, fixed now: median(N) − median(C) > +2 at >34, or > +1 at >50. These are counts; on the rates
    basis the bound is 2 / median n(C) and 1 / median n(C).

  The twins use the bound of their main threshold. A FAIL names (a), (b) or both, and goes to the lead: block 2, or not
  landing.
- **3 v 3.** The check stays at 3 v 3, as the less-work rule's short no-worse check. This is disclosed against protocol
  §5.3's 4 v 4 and P-137's 4 v 4: three runs per arm separate less easily, and the median bound covers what separation
  alone would miss.
- **N1 dry-run addendum.** No phone hold of P-150 starts before a dated addendum in this card shows:
  - `P150_DRY` for H1-H6 all `DRY ok`;
  - the served hashes, index.html included;
  - the N manifest check 38/38;
  - GESTURE_BUDGET_S;
  - the plan in the card's order.

  A kit fault found there means a re-pin and the lead's delta check.
- **N2 void holds** (level with P-145 rev 1.1 N1).
  - A hold that ends VOID is one of:
    - exit 3: end gate, or a Mac sleep;
    - exit 4: hash or setup;
    - exit 5: start gate, or WDA;
    - exit 8: a sentinel failed.
  - The runner moves that hold's g- and tl- records to `out/p150/void/<H>/` before the read. They never count; the
    reader reads only `out/p150/runs`.
  - A time-guard VOID (exit 7) that `p150-block.sh` retries whole, and that then ends VALID, is not a void hold. The
    retry moves its first try's files aside.
  - A BLOCK STOP ends the block. A restart is block 2 of 2, on the lead's go. Before it, the runner moves block 1's runs
    to `out/p150/block1/`, so block 2 is read alone and never pooled.
- **N3 first-in-hold.** EN1, EC2 and EN3 open their holds: N twice, C once. No two-per-hold grouping balances this, and
  every item restarts Safari.
  - The reader lists per counted run its hold and position (from the plan), its start (`meta.date`), the gap since the
    previous counted or sentinel run, and the battery °C of its phone hold's start read (`meta.profile.start.battC`).
  - A FAIL whose lowest N run at a failing threshold is EN1 or EN3 is labelled **position-confounded** next to the
    verdict. The outcome is unchanged.
- **N4 safari-restart wording.**
  - The fs script starts with a reload, so each run loads the page twice in one relaunched Safari. Pictures painted by
    the restart's own load decode before the reload, outside the moving frames.
  - So the claim is: "no decode from an earlier run is reused". It is not "the first decode falls inside the run".
  - Safari's HTTP disk cache survives the restart, so this checks decode, not download. Download is covered by the cost
    card, whose Simulator sessions empty the cache.
  - That the relaunch gets a new WebContent process: OBSERVED in the tool's design only (`tools/lib/safari-restart.mjs`
    quits and relaunches the app); no WebKit source is cited.
  - Whether WebKit's memory cache keeps decoded pictures across loads in one web process: UNRESOLVED. The decisive local
    check is a Simulator functional session that loads C, runs `sim.mjs safari-restart`, and compares the WebContent
    process id before and after (a `ps` inside the booted Simulator). It needs no timing.
- **N5 platform labels.**
  - "AVIF decode costs more CPU per pixel than JPEG": UNRESOLVED (no reference cited). The phone check measures the
    outcome.
  - "WebKit decodes large pictures off the main thread": UNRESOLVED for AVIF on iOS 26. Decisive check: a Timeline run on
    N looking for decode records on the main thread. It is not part of this card.
  - "The display:none wall columns are never fetched": OBSERVED in Chrome (PR-025's 430 px loads fetched 81 files, not
    89, under option A). In Safari it is UNRESOLVED until the cost card's Simulator file count shows it; that count is
    descriptive.
  - Lazy loading (Safari 15.4) and AVIF (iOS 16) stay CONFIRMED; the reader re-checked both.
- **N6 falsification, added.** The lazy edit is a second phone risk: the wall's fetch and decode move into the scroll.
  A FAIL cannot split AVIF from lazy. The follow-up would be an A-only arm (resize plus lazy, no AVIF) against N.
- **N7 rule text.**
  - R4 counts an AVIF decode test that ends 'pending' or 'zero' as a failure, like 'fail'.
  - R5 counts only gesture exit-0 runs: `sim-b.sh` renames any other record to `<tag>-<arm>.fail.json`. A run whose
    counter saw `bufferFull > 0` has no counts.
  - Simulator re-run rule: a session that ends VOID, or leaves an arm without a counted run, is re-run once as K3 (then
    K4) with the same arm order. Still short of 2 per arm: INSUFFICIENT.
  - The Chrome part checks no served hashes, so right after it the runner checks the N snapshot with `rebuild-b.mjs
    --check` (38/38) and the C snapshot's JS (1b2eecc66011). A mismatch voids the Chrome part.
  - Prediction 1 is insufficient under an INSUFFICIENT card. Prediction 3's "C about 36" is context and is not scored.
- **N8 post-data labels.** This card is post-data.
  - Predictions 1-4 are informed by PR-025's Chrome loads of the same builds.
  - Prediction 7, prediction 8 and the choice of a whole-page metric are informed by P-137's C runs (same C, driver and
    profile).
  - The user's Try-it of B (PR-025) is a judgement of looks, not a measurement. It informs nothing here.
  - No Simulator data on B has been seen: `out/end-bg/simb` does not exist, and PR-025's measurements were Chrome only.
    Predictions 5 and 6 are uninformed.
- **N9 gap between the parts.** The read reports the time between part 1's last hold and part 2's first, and every phone
  job in that gap, from `locks/holds.log`.
- **N10 wording.** The manifest's `skipped` lists all 3 seller photos as "AVIF skipped". Two of them are among the 35
  (resized only). The third, `cover.jpg`, needs no resize and is not among the 35.

### P-150 addendum rev 1.2: kit dry run (N1), 2026-10-05

- **Dry run 1 (22:15Z, `--no-timing` hold, no phone): kit fault.**
  - H1 ended VOID before any run, exit 4: the served index.html hash did not equal the pinned file hash. Served C
    3b65ade30d22 vs file 26e46ddee017; served N 8630b44e4eab vs file 10919c0334b4.
  - Cause: with `--vendors=local` the mirror server inserts the vendor shim `<script>` before `/analytics.js`
    (`tools/lib/mirror-handler.mjs` `rewriteHtml`). This is a fixed text rewrite.
  - Fix: `phone/p150-hold.sh` now pins the *served* index hashes; the file hashes stay in its comment, and the N
    snapshot's file is still checked by the manifest (38/38). Re-pinned: `phone/p150-hold.sh` 1cb0b24aa2ca →
    78965a854e29. No other file changed.
  - P-145 is not affected: it hashes JS and CSS only.
- **Dry run 2 (22:40Z, `--no-timing` hold, no phone, head 5c7fd8c1 + the re-pinned hold script): PASS.**
  - `P150_DRY=1` for H1-H6: all `DRY ok`; block exit 0.
  - Snapshots: C JS 1b2eecc66011, CSS e1359ab9994a; N JS 049b13ced4e3, CSS e1359ab9994a; N manifest 38/38.
  - Served, in every hold: C JS 1b2eecc66011, index 3b65ade30d22; N JS 049b13ced4e3, index 8630b44e4eab; CSS
    e1359ab9994a; N manifest 38/38.
  - Compiled program fs 8737f212c0ff; GESTURE_BUDGET_S 229.
  - Plan in the card's order:
    - H1: WC, WN warm-ups, Timeline off;
    - H2: S0 sentinel, then EC1;
    - H3: EN1, EN2;
    - H4: EC2, EC3;
    - H5: EN3;
    - H6: TAIL (no re-runs), then S1.
  - Gates sit at the edges (H1 start, H6 end), as one part. The real block runs two parts and so has 4 gates.
  - The PIN lines equal the card's pins, except the re-pinned hold script above.
  - All servers were stopped after the run.
- This addendum meets N1. No phone hold of P-150 starts before the lead's delta check of this rev 1.2.

### P-150 addendum rev 1.3: the no-worse rule's clause (b) gets a permutation test (lead ruling, before any data)

- **Why.** P-152's pre-data reader resampled P-137's C runs (OBSERVED, its data, our setup). The rev 1.1 rule, full
  separation OR the median bound +2/+1, FAILs a no-change V = C in 37-52 % of 4 v 4 blocks at this noise. The median
  bound alone is too loose a test of "worse".
- **Clause (b), new.** The median bound (median(N) − median(C) > +2 at >34, > +1 at >50) **and** an exact one-sided
  permutation p ≤ 0.05.
  - The statistic is N's mean minus C's mean over the valid runs of the threshold. The test runs over every relabeling
    of those runs into groups of the arms' sizes.
  - p is the share of relabelings whose statistic is ≥ the observed one; ties count against N.
  - On the rates basis the same test runs on s/n, with the bound scaled by median n(C), as before.
- **Unchanged.** Clause (a), full separation (min N > max C), stays. Either clause makes that threshold WORSE. The
  twins use their main threshold's bound and the same test.
- **Power limit (disclosed).** 3 v 3 has only 20 relabelings, so p ≤ 0.05 needs the observed labeling to be the unique
  top one, and that is full separation. At this card's 3 v 3, clause (b) therefore adds nothing to clause (a): the check
  fails only on full separation. A no-change N passes unless chance alone separates the arms (at most 1 in 20 per
  threshold). A real regression that leaves one N run at or below max(C) also passes.

  That is the cost of a short no-worse check, and it is stated here rather than hidden. Clause (b) is kept for a block
  whose re-runs leave other arm sizes. At 4 v 4 there are 70 relabelings, so p ≤ 0.05 needs the observed one among the
  top 3.
- **Self-test (`phone/p150-read.mjs`, 17 ok).**
  - Passes: V = C with the same values relabelled; the bound-only case C 14/15/30 vs N 25/28/29 (median +13, p 4/20);
    median +3 with p > 0.05.
  - Fails: a clear regression, on both clauses (p 1/20); a 4 v 4 case with the bound and p 2/70 but no separation.
  - A 3 v 3 tie at the boundary gives p > 0.05.
- **Re-pinned:** `phone/p150-read.mjs` 24b1ed51f58e → b5d113ef3760. Nothing else changed.
- **Predictions.** They are left as registered (rev 1.1): this is a rule change before any phone data. Prediction 7's
  FAIL row now means "WORSE under rev 1.3".
